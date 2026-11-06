//! Bounded component correspondence and pin/net verification.
use std::collections::{BTreeMap, BTreeSet};

use cirnet_contracts_native::validation::Registry;
use serde_json::{Value, json};

use super::{
    array,
    routing::{NodeOptions, allocate_routes},
    text, validate,
};
use crate::error::ApiError;

type Result<T> = std::result::Result<T, ApiError>;
type Pin<'a> = (&'a str, &'a str);
type Signature<'a> = BTreeSet<Pin<'a>>;
type Match<'a> = BTreeMap<&'a str, &'a str>;
type Components<'a> = BTreeMap<&'a str, &'a Value>;
type Profiles<'a> = BTreeMap<&'a str, BTreeMap<&'a str, &'a str>>;

const SUPPORTED: &[&str] = &[
    "74HC08", "74HC04", "74HC32", "74HC86", "AND", "NOT", "OR", "XOR", "SWITCH", "INPUT", "LED",
    "PROBE", "CLOCK",
];
const MAX_COMPONENTS: usize = 32;
const MAX_MAPPINGS: usize = 64;
const MAX_SEARCH_STEPS: usize = 4096;

fn invalid_graph() -> ApiError {
    ApiError::new("INVALID_CONTRACT", 422)
}

struct ElectricalNets<'a> {
    roots: BTreeMap<&'a str, &'a str>,
    nodes: BTreeMap<&'a str, BTreeSet<&'a str>>,
    pins: BTreeMap<&'a str, Signature<'a>>,
    pin_nodes: BTreeMap<Pin<'a>, &'a str>,
}

impl<'a> ElectricalNets<'a> {
    fn from_graph(graph: &'a Value) -> Result<Self> {
        let mut parents: BTreeMap<_, _> = array(&graph["nodes"])
            .iter()
            .map(|node| {
                let id = text(node, "node_id");
                (id, id)
            })
            .collect();
        for connection in array(&graph["connections"]) {
            let Some((first, rest)) = array(&connection["node_ids"]).split_first() else {
                return Err(invalid_graph());
            };
            let first = first.as_str().ok_or_else(invalid_graph)?;
            for node in rest {
                let a = find_root(&mut parents, first)?;
                let b = find_root(&mut parents, node.as_str().ok_or_else(invalid_graph)?)?;
                parents.insert(a.max(b), a.min(b));
            }
        }
        let mut roots = BTreeMap::new();
        let mut nodes = BTreeMap::<_, BTreeSet<_>>::new();
        let node_ids: Vec<_> = parents.keys().copied().collect();
        for node in node_ids {
            let root = find_root(&mut parents, node)?;
            roots.insert(node, root);
            nodes.entry(root).or_default().insert(node);
        }
        let mut pins = BTreeMap::<_, Signature<'_>>::new();
        let mut pin_nodes = BTreeMap::new();
        for component in array(&graph["components"]) {
            for pin in array(&component["pins"]) {
                let key = (text(component, "component_id"), text(pin, "pin_id"));
                let node = text(pin, "node_id");
                let root = *roots.get(node).ok_or_else(invalid_graph)?;
                pins.entry(root).or_default().insert(key);
                pin_nodes.insert(key, node);
            }
        }
        Ok(Self {
            roots,
            nodes,
            pins,
            pin_nodes,
        })
    }

    fn pin_root(&self, key: Pin<'_>) -> Option<&'a str> {
        self.pin_nodes
            .get(&key)
            .and_then(|node| self.roots.get(node))
            .copied()
    }

    fn signatures(&self, rename: &Match<'a>) -> BTreeMap<Signature<'a>, Vec<&'a str>> {
        let mut result = BTreeMap::<_, Vec<_>>::new();
        for (&root, pins) in &self.pins {
            result
                .entry(rename_pins(pins, rename))
                .or_default()
                .push(root);
        }
        result
    }
}

fn find_root<'a>(parents: &mut BTreeMap<&'a str, &'a str>, mut node: &'a str) -> Result<&'a str> {
    loop {
        let parent = *parents.get(node).ok_or_else(invalid_graph)?;
        if parent == node {
            return Ok(node);
        }
        let grandparent = *parents.get(parent).ok_or_else(invalid_graph)?;
        parents.insert(node, grandparent);
        node = grandparent;
    }
}

fn rename_pins<'a>(pins: &Signature<'a>, rename: &Match<'a>) -> Signature<'a> {
    pins.iter()
        .map(|&(component, pin)| (rename.get(component).copied().unwrap_or(component), pin))
        .collect()
}

fn components(graph: &Value) -> Components<'_> {
    array(&graph["components"])
        .iter()
        .map(|component| (text(component, "component_id"), component))
        .collect()
}

fn known(component: &Value) -> bool {
    text(component, "identity") != "UNKNOWN"
        && text(component, "kind") != "OPAQUE_PHYSICAL_COMPONENT"
}

fn uncertain(value: &Value) -> bool {
    value.get("confidence").and_then(Value::as_f64) == Some(0.0)
}

fn optional_object(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| {
        !value.is_null() && !value.as_object().is_some_and(|object| object.is_empty())
    })
}

fn minimum_confidence<'a>(values: impl Iterator<Item = &'a Value>) -> Option<&'a Value> {
    values
        .filter_map(|value| value.as_f64().map(|number| (value, number)))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(value, _)| value)
}

fn candidate_matches<'a>(
    reference: &'a Components<'a>,
    observed: &'a Components<'a>,
    profiles: &Profiles<'_>,
    mode: &str,
    issues: &mut Vec<Value>,
) -> Vec<(&'a str, Vec<&'a str>)> {
    let mut candidates = Vec::new();
    for (&id, component) in reference {
        let identity = text(component, "identity");
        let profile = profiles.get(identity).filter(|profile| !profile.is_empty());
        let ref_pins = array(&component["pins"]);
        let pins: BTreeSet<_> = ref_pins.iter().map(|pin| text(pin, "pin_id")).collect();
        let supported = known(component)
            && !pins.is_empty()
            && !ref_pins.iter().any(uncertain)
            && (SUPPORTED.contains(&identity.to_uppercase().as_str()) || profile.is_some())
            && (mode != "INSTRUCTOR_PROFILE" || profile.is_some())
            && profile.is_none_or(|profile| pins.iter().all(|pin| profile.contains_key(pin)));
        let mut options = Vec::new();
        if supported {
            let package = text(component, "package");
            for (&actual_id, actual) in observed {
                let actual_pins = array(&actual["pins"]);
                let actual_pin_ids: BTreeSet<_> =
                    actual_pins.iter().map(|pin| text(pin, "pin_id")).collect();
                let actual_package = text(actual, "package");
                if known(actual)
                    && text(actual, "identity") == identity
                    && actual_pin_ids == pins
                    && !actual_pins.iter().any(uncertain)
                    && (package.is_empty()
                        || actual_package.is_empty()
                        || package == actual_package)
                    && profile.is_none_or(|profile| {
                        actual_pins.iter().all(|pin| {
                            let inferred = text(pin, "inferred_role");
                            inferred.is_empty() || profile[text(pin, "pin_id")] == inferred
                        })
                    })
                {
                    options.push(actual_id);
                }
            }
        }
        if options.is_empty() {
            issues.push(json!(format!("No supported pin evidence match for {id}")));
        } else {
            candidates.push((id, options));
        }
    }
    candidates.sort_unstable_by_key(|(id, options)| (options.len(), *id));
    candidates
}

struct Search<'a, 'b> {
    candidates: &'b [(&'a str, Vec<&'a str>)],
    reference: &'b Components<'a>,
    reference_nets: &'b ElectricalNets<'a>,
    observed_nets: &'b ElectricalNets<'a>,
    steps: usize,
    limited: bool,
    mappings: Vec<Match<'a>>,
}

impl<'a> Search<'a, '_> {
    fn incidence_compatible(&self, mapping: &[Pin<'a>]) -> bool {
        // Preserve both joins and separations; the anchor net size also rules
        // out permutations that cannot match unmapped component pins.
        let mut forward = BTreeMap::new();
        let mut reverse = BTreeMap::new();
        for &(reference, observed) in mapping {
            for pin in array(&self.reference[reference]["pins"]) {
                let id = text(pin, "pin_id");
                let Some(ref_root) = self.reference_nets.pin_root((reference, id)) else {
                    return false;
                };
                let Some(obs_root) = self.observed_nets.pin_root((observed, id)) else {
                    return false;
                };
                if self.reference_nets.pins[ref_root].len()
                    != self.observed_nets.pins[obs_root].len()
                    || forward
                        .insert(ref_root, obs_root)
                        .is_some_and(|previous| previous != obs_root)
                    || reverse
                        .insert(obs_root, ref_root)
                        .is_some_and(|previous| previous != ref_root)
                {
                    return false;
                }
            }
        }
        true
    }

    fn visit(
        &mut self,
        mapping: &mut Vec<Pin<'a>>,
        used: &mut BTreeSet<&'a str>,
        equivalent: bool,
    ) {
        self.steps += 1;
        if self.steps > MAX_SEARCH_STEPS {
            self.limited = true;
            return;
        }
        let candidates = self.candidates;
        let Some((reference, options)) = candidates.get(mapping.len()) else {
            if self.mappings.len() >= MAX_MAPPINGS {
                self.limited = true;
            } else {
                self.mappings.push(mapping.iter().copied().collect());
            }
            return;
        };
        for &actual in options {
            if !used.insert(actual) {
                continue;
            }
            mapping.push((reference, actual));
            if !equivalent || self.incidence_compatible(mapping) {
                self.visit(mapping, used, equivalent);
            }
            mapping.pop();
            used.remove(actual);
            if self.limited {
                return;
            }
        }
    }
}

fn match_components<'a>(
    reference: &'a Components<'a>,
    observed: &'a Components<'a>,
    reference_nets: &ElectricalNets<'a>,
    observed_nets: &ElectricalNets<'a>,
    profiles: &Profiles<'_>,
    mode: &str,
    issues: &mut Vec<Value>,
) -> (Match<'a>, bool) {
    let candidates = candidate_matches(reference, observed, profiles, mode, issues);
    let mut search = Search {
        candidates: &candidates,
        reference,
        reference_nets,
        observed_nets,
        steps: 0,
        limited: reference.len() > MAX_COMPONENTS || observed.len() > MAX_COMPONENTS,
        mappings: Vec::new(),
    };
    if !search.limited && !candidates.is_empty() {
        if candidates.len() == reference.len() && reference.len() == observed.len() {
            search.visit(&mut Vec::new(), &mut BTreeSet::new(), true);
        }
        if search.mappings.is_empty() && !search.limited {
            // Wiring errors must not erase a unique identity/pin anchor.
            search.visit(&mut Vec::new(), &mut BTreeSet::new(), false);
        }
    }
    if search.limited {
        issues.push(json!(
            "Resolution search budget exceeded; mapping remains ambiguous"
        ));
        return (Match::new(), true);
    }
    let ambiguous = search.mappings.len() > 1;
    let mut mappings = search.mappings.into_iter();
    let mut common = mappings.next().unwrap_or_default();
    for mapping in mappings {
        common.retain(|key, value| mapping.get(key) == Some(&*value));
    }
    (common, ambiguous)
}

fn reference_binding<'a>(
    endpoint: &Value,
    ref_node: &str,
    reference: &ElectricalNets<'a>,
    observed: &ElectricalNets<'a>,
    common: &Match<'a>,
    caps: &Value,
    confidence: &BTreeMap<&str, &Value>,
    connection_confidence: Option<&Value>,
) -> Option<(BTreeSet<&'a str>, Option<Value>)> {
    let root = reference.roots.get(ref_node)?;
    let reference_pins = reference.pins.get(root)?;
    let direct: Vec<_> = reference_pins
        .iter()
        .filter(|pin| reference.pin_nodes[*pin] == ref_node)
        .collect();
    let selected = if direct.is_empty() {
        reference_pins.iter().collect()
    } else {
        direct
    };
    let observed_nodes: BTreeSet<_> = selected
        .iter()
        .filter_map(|&&(component, pin)| {
            observed
                .pin_nodes
                .get(&(*common.get(component)?, pin))
                .copied()
        })
        .collect();
    let root = observed.roots[observed_nodes.first()?];
    if observed_nodes
        .iter()
        .any(|node| observed.roots[node] != root)
    {
        return None;
    }
    let role = &endpoint["role"];
    let routable: BTreeSet<_> = array(&caps["routing_resources"])
        .iter()
        .filter(|resource| array(&resource["roles"]).contains(role))
        .flat_map(|resource| {
            array(&resource["node_ids"])
                .iter()
                .filter_map(Value::as_str)
        })
        .collect();
    let aliases: BTreeSet<_> = observed.nodes[root]
        .iter()
        .copied()
        .filter(|node| routable.contains(node))
        .collect();
    let nodes = if aliases.is_empty() {
        observed_nodes
    } else {
        aliases
    };
    let confidence = minimum_confidence(
        selected
            .iter()
            .filter_map(|&&(component, _)| confidence.get(component).copied())
            .chain(connection_confidence),
    )
    .cloned();
    Some((nodes, confidence))
}

fn allocate_bindings(
    bindings: &mut [Value],
    endpoints: &[Value],
    caps: &Value,
    options: &NodeOptions,
) {
    let roles: BTreeMap<_, _> = endpoints
        .iter()
        .map(|endpoint| (text(endpoint, "endpoint_id"), &endpoint["role"]))
        .collect();
    let requests: Vec<_> = bindings
        .iter()
        .map(|binding| {
            json!({
                "endpoint_id": binding["endpoint_id"], "node_id": binding["observed_node_id"],
                "role": roles.get(text(binding, "endpoint_id")),
            })
        })
        .collect();
    let resources = array(&caps["routing_resources"]);
    let Ok(allocations) = allocate_routes(&requests, resources, options) else {
        // Keep semantic bindings. The compiler owns the executability verdict.
        return;
    };
    let by_endpoint: BTreeMap<_, _> = allocations
        .iter()
        .map(|route| (text(route, "endpoint_id"), text(route, "resource_id")))
        .collect();
    let by_resource: BTreeMap<_, _> = resources
        .iter()
        .map(|resource| {
            (
                text(resource, "resource_id"),
                array(&resource["node_ids"])
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<BTreeSet<_>>(),
            )
        })
        .collect();
    for binding in bindings {
        let endpoint = text(binding, "endpoint_id");
        let Some(resource) = by_endpoint.get(endpoint).and_then(|id| by_resource.get(id)) else {
            continue;
        };
        let node = options
            .get(endpoint)
            .and_then(|nodes| nodes.iter().find(|node| resource.contains(node.as_str())));
        if let Some(node) = node {
            binding["observed_node_id"] = json!(node);
        }
    }
}

pub fn resolve_topology(
    registry: &Registry,
    assignment: Option<&Value>,
    observed: &Value,
    caps: Option<&Value>,
) -> Result<Value> {
    let assignment = assignment.unwrap_or(&Value::Null);
    let observed = validate(registry, "DetectedTopologyGraph", observed)?;
    let reference = optional_object(assignment.get("reference_topology_graph"))
        .map(|reference| validate(registry, "DetectedTopologyGraph", reference))
        .transpose()?;
    let evidence = [&observed, reference.as_ref().unwrap_or(&Value::Null)];
    let observed_nets = ElectricalNets::from_graph(&observed)?;
    let reference_nets = reference
        .as_ref()
        .map(ElectricalNets::from_graph)
        .transpose()?;
    let observed_components = components(&observed);
    let reference_components = components(evidence[1]);
    let profiles = array(&assignment["instructor_pin_profiles"])
        .iter()
        .map(|profile| {
            (
                text(profile, "component_type"),
                array(&profile["pins"])
                    .iter()
                    .map(|pin| (text(pin, "pin_id"), text(pin, "role")))
                    .collect(),
            )
        })
        .collect();
    let caps = optional_object(caps);
    let mode = assignment
        .get("component_resolution_mode")
        .map_or("HYBRID", |mode| mode.as_str().unwrap_or_default());
    let mode_supported = caps.is_none_or(|caps| {
        array(&caps["component_resolution_modes"])
            .iter()
            .any(|value| value == mode)
    });
    let unscoped = evidence.iter().any(|graph| {
        !array(&graph["ambiguities"]).is_empty()
            || array(&graph["connections"]).iter().any(uncertain)
    });
    let uncertain_pins = evidence
        .iter()
        .flat_map(|graph| array(&graph["components"]))
        .flat_map(|component| array(&component["pins"]))
        .any(uncertain);
    let mut issues = Vec::new();
    if unscoped {
        issues.push(json!(
            "Unscoped pin/net uncertainty prevents reference inference"
        ));
        issues.extend(
            evidence
                .iter()
                .flat_map(|graph| array(&graph["ambiguities"]))
                .cloned(),
        );
    }
    let (common, ambiguous_matches) = match &reference_nets {
        Some(nets) if mode_supported && !unscoped => match_components(
            &reference_components,
            &observed_components,
            nets,
            &observed_nets,
            &profiles,
            mode,
            &mut issues,
        ),
        Some(_) if !mode_supported => {
            issues.push(json!("Requested component resolution mode is unsupported"));
            (Match::new(), false)
        }
        _ => (Match::new(), false),
    };
    let mut matches = Vec::new();
    let mut match_confidence = BTreeMap::new();
    for (&reference, &observed) in &common {
        let component = reference_components[reference];
        let mut matched = json!({
            "reference_component_id": reference, "observed_component_id": observed, "identity": component["identity"],
        });
        let confidence = minimum_confidence(
            [component, observed_components[observed]]
                .into_iter()
                .flat_map(|component| array(&component["pins"]))
                .filter_map(|pin| pin.get("confidence")),
        );
        if let Some(confidence) = confidence {
            matched["confidence"] = confidence.clone();
            match_confidence.insert(reference, confidence);
        }
        matches.push(matched);
    }
    let connection_confidence = minimum_confidence(
        evidence
            .iter()
            .flat_map(|graph| array(&graph["connections"]))
            .filter_map(|connection| connection.get("confidence")),
    );
    let endpoints = array(&assignment["lab_endpoints"]);
    let mut bindings = Vec::new();
    let mut options = NodeOptions::new();
    for endpoint in endpoints {
        let endpoint_id = text(endpoint, "endpoint_id");
        let mut node = endpoint
            .get("fixed_node_id")
            .or_else(|| endpoint.get("node_id"))
            .and_then(Value::as_str)
            .filter(|node| observed_nets.roots.contains_key(node));
        let mut source = "FIXED_NODE";
        let mut confidence = None;
        if let (Some(reference_node), Some(reference)) =
            (endpoint.get("reference_node_id"), &reference_nets)
        {
            source = "REFERENCE_TOPOLOGY";
            if let Some((nodes, evidence)) = reference_binding(
                endpoint,
                reference_node.as_str().unwrap_or_default(),
                reference,
                &observed_nets,
                &common,
                caps.unwrap_or(&Value::Null),
                &match_confidence,
                connection_confidence,
            ) {
                node = nodes.first().copied();
                options.insert(
                    endpoint_id.to_owned(),
                    nodes.into_iter().map(str::to_owned).collect(),
                );
                confidence = evidence;
            }
        }
        if let Some(node) = node {
            let mut binding =
                json!({"endpoint_id": endpoint_id, "observed_node_id": node, "source": source});
            if let Some(confidence) = confidence {
                binding["confidence"] = confidence;
            }
            bindings.push(binding);
        } else {
            issues.push(json!(format!("Endpoint unresolved: {endpoint_id}")));
        }
    }
    if let Some(caps) = caps
        && !bindings.is_empty()
    {
        allocate_bindings(&mut bindings, endpoints, caps, &options);
    }
    let bound: BTreeSet<_> = bindings
        .iter()
        .map(|binding| text(binding, "endpoint_id"))
        .collect();
    let all_required = endpoints
        .iter()
        .filter(|endpoint| endpoint.get("required").map_or(true, |value| value == true))
        .all(|endpoint| bound.contains(text(endpoint, "endpoint_id")));
    let status = if ambiguous_matches || unscoped || uncertain_pins {
        issues.push(json!(if unscoped || uncertain_pins {
            "Physical pin/net evidence is uncertain"
        } else {
            "Multiple equally supported component mappings"
        }));
        "AMBIGUOUS"
    } else if all_required && !bound.is_empty() {
        "RESOLVED"
    } else if !bound.is_empty() || !common.is_empty() {
        "PARTIAL"
    } else {
        "UNRESOLVED"
    };
    let confidence = minimum_confidence(
        matches
            .iter()
            .chain(&bindings)
            .filter_map(|value| value.get("confidence")),
    )
    .cloned();
    let mut result = json!({
        "schema_version": "1.0", "status": status, "component_matches": matches,
        "endpoint_bindings": bindings, "issues": issues,
    });
    if let Some(confidence) = confidence {
        result["confidence"] = confidence;
    }
    validate(registry, "TopologyResolutionResult", &result)
}

fn identity_counts<'a>(identities: impl Iterator<Item = &'a str>) -> BTreeMap<&'a str, usize> {
    let mut result = BTreeMap::new();
    for identity in identities {
        *result.entry(identity).or_default() += 1;
    }
    result
}

fn quantity_difference(left: &BTreeMap<&str, usize>, right: &BTreeMap<&str, usize>) -> Vec<Value> {
    left.iter()
        .filter_map(|(&identity, &count)| {
            let difference = count.saturating_sub(right.get(identity).copied().unwrap_or_default());
            (difference > 0).then(|| json!({"identity": identity, "count": difference}))
        })
        .collect()
}

fn diagnostic(
    signature: &Signature<'_>,
    reference: &ElectricalNets<'_>,
    observed: &ElectricalNets<'_>,
    ref_roots: &[&str],
    obs_roots: &[&str],
    is_reference: bool,
) -> Value {
    fn nodes<'a>(nets: &ElectricalNets<'a>, roots: &[&str]) -> Vec<&'a str> {
        let mut result: Vec<_> = roots
            .iter()
            .flat_map(|root| nets.nodes[*root].iter().copied())
            .collect();
        result.sort_unstable();
        result
    }

    fn names<'a>(pins: impl Iterator<Item = &'a Pin<'a>>) -> Vec<String> {
        let mut result: Vec<_> = pins
            .map(|(component, pin)| format!("{component}.{pin}"))
            .collect();
        result.sort_unstable();
        result
    }

    json!({
        "reference_nodes": nodes(reference, ref_roots),
        "observed_nodes": nodes(observed, obs_roots),
        "reference_pins": if is_reference { names(signature.iter()) } else { Vec::new() },
        "observed_pins": names(obs_roots.iter().flat_map(|root| observed.pins[*root].iter())),
    })
}

fn compare_incidence(
    reference: &Value,
    observed: &Value,
    matches: &[Value],
    details: &mut Value,
    issues: &mut Vec<Value>,
) -> Result<(bool, bool)> {
    let ref_nets = ElectricalNets::from_graph(reference)?;
    let obs_nets = ElectricalNets::from_graph(observed)?;
    let rename: Match<'_> = matches
        .iter()
        .map(|matched| {
            (
                text(matched, "observed_component_id"),
                text(matched, "reference_component_id"),
            )
        })
        .collect();
    let ref_signatures = ref_nets.signatures(&Match::new());
    let obs_signatures = obs_nets.signatures(&rename);
    let describe = |signature, is_reference| {
        diagnostic(
            signature,
            &ref_nets,
            &obs_nets,
            ref_signatures.get(signature).map_or(&[][..], Vec::as_slice),
            obs_signatures.get(signature).map_or(&[][..], Vec::as_slice),
            is_reference,
        )
    };
    let mut matched_nets = Vec::new();
    let mut missing_nets = Vec::new();
    let mut unexpected_nets = Vec::new();
    for signature in ref_signatures.keys() {
        let item = describe(signature, true);
        if obs_signatures.contains_key(signature) {
            matched_nets.push(item);
        } else {
            missing_nets.push(item);
        }
    }
    for signature in obs_signatures.keys() {
        if !ref_signatures.contains_key(signature) {
            unexpected_nets.push(describe(signature, false));
        }
    }
    let complete = matches.len() == array(&reference["components"]).len()
        && matches.len() == array(&observed["components"]).len()
        && array(&observed["components"])
            .iter()
            .all(|component| !array(&component["pins"]).is_empty());
    let mismatch = complete && (!missing_nets.is_empty() || !unexpected_nets.is_empty());
    details["matched_nets"] = json!(matched_nets);
    details["missing_nets"] = json!(missing_nets);
    details["unexpected_nets"] = json!(unexpected_nets);
    if mismatch {
        issues.push(json!("Component pin-to-net incidence differs"));
        let expected: BTreeMap<_, _> = ref_signatures
            .keys()
            .flat_map(|signature| signature.iter().map(move |&pin| (pin, signature)))
            .collect();
        let shorts: Vec<_> = obs_signatures
            .keys()
            .filter_map(|signature| {
                let partitions: BTreeSet<_> = signature
                    .iter()
                    .filter_map(|pin| expected.get(pin))
                    .collect();
                (partitions.len() > 1).then(|| describe(signature, false))
            })
            .collect();
        details["shorted_nets"] = json!(shorts);

        let reference_components = components(reference);
        let mut pin_issues = Vec::new();
        for matched in matches {
            let reference_id = text(matched, "reference_component_id");
            let observed_id = text(matched, "observed_component_id");
            let component = reference_components
                .get(reference_id)
                .ok_or_else(invalid_graph)?;
            // The component's captured pin array determines diagnostic order.
            for pin in array(&component["pins"]) {
                let pin_id = text(pin, "pin_id");
                let ref_node = ref_nets
                    .pin_nodes
                    .get(&(reference_id, pin_id))
                    .ok_or_else(invalid_graph)?;
                let obs_node = obs_nets
                    .pin_nodes
                    .get(&(observed_id, pin_id))
                    .ok_or_else(invalid_graph)?;
                let ref_signature = &ref_nets.pins[ref_nets.roots[*ref_node]];
                let obs_signature = rename_pins(&obs_nets.pins[obs_nets.roots[*obs_node]], &rename);
                if *ref_signature != obs_signature {
                    pin_issues.push(json!({
                        "reference_component_id": reference_id, "observed_component_id": observed_id,
                        "pin_id": pin_id, "reference_node_id": ref_node, "observed_node_id": obs_node,
                        "issue": "Electrical pin net differs",
                    }));
                }
            }
        }
        details["pin_mapping_issues"] = json!(pin_issues);
        details["pin_mapping_differences"] = details["pin_mapping_issues"].clone();
    }
    Ok((complete, mismatch))
}

pub fn verify_topology(
    registry: &Registry,
    assignment: Option<&Value>,
    observed: &Value,
    resolution: Option<&Value>,
) -> Result<Value> {
    let assignment = assignment.unwrap_or(&Value::Null);
    let observed = validate(registry, "DetectedTopologyGraph", observed)?;
    let reference = optional_object(assignment.get("reference_topology_graph"));
    let resolved;
    let resolution = if let Some(resolution) = optional_object(resolution) {
        resolution
    } else {
        resolved = resolve_topology(registry, Some(assignment), &observed, None)?;
        &resolved
    };
    let observed_components = array(&observed["components"]);
    let unknown: Vec<_> = observed_components
        .iter()
        .filter(|component| !known(component))
        .map(|component| json!({"identity": "UNKNOWN", "component_id": component["component_id"]}))
        .collect();
    let expected = if let Some(set) = assignment.get("expected_component_set") {
        identity_counts(array(set).iter().filter_map(Value::as_str))
    } else {
        identity_counts(
            reference
                .into_iter()
                .flat_map(|graph| array(&graph["components"]))
                .map(|component| text(component, "identity")),
        )
    };
    let actual = identity_counts(
        observed_components
            .iter()
            .filter(|component| known(component))
            .map(|component| text(component, "identity")),
    );
    let missing = quantity_difference(&expected, &actual);
    let unexpected = if expected.is_empty() && reference.is_none() {
        Vec::new()
    } else {
        quantity_difference(&actual, &expected)
    };
    let component_mismatch = !unexpected.is_empty() || (!missing.is_empty() && unknown.is_empty());
    let mut issues = Vec::new();
    if !missing.is_empty() || !unexpected.is_empty() {
        issues.push(json!("Component quantities differ from reference"));
    }
    if !unknown.is_empty() {
        issues.push(json!("Component identity unresolved"));
    }
    let matches = array(&resolution["component_matches"]);
    let mut details = json!({
        "schema_version": "1.0",
        "matched_components": matches,
        "missing_components": missing,
        "unexpected_components": unexpected,
        "unknown_components": unknown,
        "matched_nets": [], "missing_nets": [], "unexpected_nets": [], "shorted_nets": [],
        "pin_mapping_issues": [], "orientation_differences": [], "pin_mapping_differences": [],
    });
    let (complete, net_mismatch) = if let Some(reference) = reference
        && !matches.is_empty()
    {
        compare_incidence(reference, &observed, matches, &mut details, &mut issues)?
    } else {
        (false, false)
    };
    let status = if component_mismatch || net_mismatch {
        "MISMATCH"
    } else if !unknown.is_empty() {
        "UNKNOWN"
    } else if resolution["status"] == "AMBIGUOUS" || !array(&observed["ambiguities"]).is_empty() {
        "AMBIGUOUS"
    } else if complete {
        "MATCH"
    } else {
        issues.push(json!("Insufficient supported pin/net evidence"));
        "UNKNOWN"
    };
    details["status"] = json!(status);
    details["issues"] = json!(issues);
    validate(registry, "TopologyVerificationResult", &details)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs, path::Path};

    #[test]
    #[ignore = "requires the exact Python topology fixture and Contracts registry"]
    fn resolver_budgets_and_short_diagnostics_match_python() {
        let corpus = env::var("CIRNET_REMOTE_TOPOLOGY_EDGE_CORPUS").unwrap();
        let corpus: Vec<Value> = serde_json::from_slice(&fs::read(corpus).unwrap()).unwrap();
        let contracts = env::var("CIRNET_CONTRACTS_ROOT").unwrap();
        let registry = Registry::load(Path::new(&contracts)).unwrap();
        assert_eq!(
            corpus
                .iter()
                .map(|case| text(case, "name"))
                .collect::<Vec<_>>(),
            ["multiple-shorts", "mapping-budget", "search-step-budget"],
        );
        for case in corpus {
            let name = text(&case, "name");
            let assignment = Some(&case["assignment"]);
            let observed = &case["observed"];
            let resolution = resolve_topology(&registry, assignment, observed, None).unwrap();
            assert_eq!(resolution, case["resolution"], "{name} resolution");
            if name != "multiple-shorts" {
                assert_eq!(resolution["status"], "AMBIGUOUS");
                assert!(
                    resolution["component_matches"]
                        .as_array()
                        .unwrap()
                        .is_empty()
                );
            }
            for supplied in [None, Some(&resolution)] {
                let mut actual =
                    verify_topology(&registry, assignment, observed, supplied).unwrap();
                let mut expected = case["verification"].clone();
                if name == "multiple-shorts" {
                    // Fresh Python processes can enumerate the same two
                    // shorted-net signatures in either order. All other fields,
                    // including pin-mapping diagnostics, retain exact order.
                    let actual_shorts = actual
                        .as_object_mut()
                        .unwrap()
                        .remove("shorted_nets")
                        .unwrap();
                    let expected_shorts = expected
                        .as_object_mut()
                        .unwrap()
                        .remove("shorted_nets")
                        .unwrap();
                    let mut remaining = array(&expected_shorts).to_vec();
                    assert_eq!(array(&actual_shorts).len(), 2);
                    for short in array(&actual_shorts) {
                        let index = remaining
                            .iter()
                            .position(|candidate| candidate == short)
                            .expect("the whole shorted-net diagnostic matches");
                        remaining.remove(index);
                    }
                    assert!(remaining.is_empty());
                    assert_eq!(
                        array(&actual["pin_mapping_issues"])
                            .iter()
                            .map(|pin| text(pin, "pin_id"))
                            .collect::<Vec<_>>(),
                        ["2", "1", "2", "1"],
                    );
                }
                assert_eq!(actual, expected, "{name} verification");
            }
        }
    }
}

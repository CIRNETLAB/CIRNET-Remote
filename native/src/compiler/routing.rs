use super::{array, text};
use crate::error::ApiError;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
pub type NodeOptions = BTreeMap<String, BTreeSet<String>>;
pub fn allocate_routes(
    bindings: &[Value],
    resources: &[Value],
    options: &NodeOptions,
) -> Result<Vec<Value>, ApiError> {
    let mut candidates: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for binding in bindings {
        let default = BTreeSet::from([text(binding, "node_id").to_owned()]);
        let nodes = options
            .get(text(binding, "endpoint_id"))
            .unwrap_or(&default);
        let mut matches: Vec<_> = resources
            .iter()
            .filter(|r| {
                array(&r["roles"]).iter().any(|v| v == &binding["role"])
                    && array(&r["node_ids"])
                        .iter()
                        .any(|n| n.as_str().is_some_and(|n| nodes.contains(n)))
            })
            .map(|r| text(r, "resource_id").to_owned())
            .collect();
        matches.sort();
        candidates.insert(text(binding, "endpoint_id").into(), matches);
    }
    fn assign(
        id: &str,
        candidates: &BTreeMap<String, Vec<String>>,
        assigned: &mut BTreeMap<String, String>,
        visited: &mut BTreeSet<String>,
    ) -> bool {
        for resource in &candidates[id] {
            if !visited.insert(resource.clone()) {
                continue;
            }
            let previous = assigned.get(resource).cloned();
            if previous.is_none_or(|previous| assign(&previous, candidates, assigned, visited)) {
                assigned.insert(resource.clone(), id.into());
                return true;
            }
        }
        false
    }
    let mut keys: Vec<_> = candidates.keys().collect();
    keys.sort_by(|a, b| (candidates[*a].len(), *a).cmp(&(candidates[*b].len(), *b)));
    let mut assigned = BTreeMap::new();
    for key in keys {
        if !assign(key, &candidates, &mut assigned, &mut BTreeSet::new()) {
            return Err(ApiError::new("UNEXECUTABLE", 422));
        }
    }
    let inverse: BTreeMap<_, _> = assigned.into_iter().map(|(r, e)| (e, r)).collect();
    Ok(bindings.iter().map(|b|json!({"endpoint_id":b["endpoint_id"],"resource_id":inverse[text(b,"endpoint_id")]})).collect())
}

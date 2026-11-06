//! JSON decoding at the legacy HTTP request boundary.
use std::fmt::Write;

use cirnet_contracts_native::validation::{Registry, ValidationError, ValidationIssue};
use http::HeaderValue;
use serde_json::{Value, json};

use crate::error::ApiError;

pub(crate) fn is_json_media_type(value: Option<&HeaderValue>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let media = value
        .as_bytes()
        .split(|byte| *byte == b';')
        .next()
        .unwrap_or_default();
    let whitespace = |byte: &u8| byte.is_ascii_whitespace() || matches!(byte, 0x85 | 0xa0);
    let Some(start) = media.iter().position(|byte| !whitespace(byte)) else {
        return false;
    };
    let end = media
        .iter()
        .rposition(|byte| !whitespace(byte))
        .expect("nonempty media");
    let media = &media[start..=end];
    let Some(slash) = media.iter().position(|byte| *byte == b'/') else {
        return false;
    };
    let subtype = &media[slash + 1..];
    !subtype.contains(&b'/')
        && media[..slash].eq_ignore_ascii_case(b"application")
        && (subtype.eq_ignore_ascii_case(b"json")
            || subtype
                .get(subtype.len().saturating_sub(5)..)
                .is_some_and(|suffix| suffix.eq_ignore_ascii_case(b"+json")))
}

pub(crate) fn media_type_error(profile: &str) -> ApiError {
    issue("SCHEMA_TYPE", "/body", profile)
}

pub(crate) fn decode(body: &[u8], _profile: &str) -> Result<Value, ApiError> {
    if body.is_empty() {
        return Ok(Value::Null);
    }
    let source = std::str::from_utf8(body).map_err(|_| {
        ApiError::new("INVALID_REQUEST_FRAMING", 400)
            .with_message("The request framing is invalid.")
    })?;
    // The legacy JSON loader receives bytes and consumes a UTF-8 BOM.
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    let error = match serde_json::from_str(source) {
        Ok(value) => return Ok(value),
        Err(error) => error,
    };
    // Keep serde as the sole value decoder. This pass determines legacy
    // offsets only on rejection and identifies Python's nonfinite literals.
    let repaired = SyntaxProbe::new(source)
        .inspect()
        .map_err(|byte| invalid_json(source, byte))?;
    let Some(repaired) = repaired else {
        return Err(invalid_json(source, serde_error_byte(source, &error)));
    };
    serde_json::from_slice(&repaired)
        .map_err(|_| invalid_json(source, serde_error_byte(source, &error)))
}

/// Match Python's schema-before-finite diagnostic for the proven string-only
/// project-create shape. The original value has already been rejected; the
/// projected value is never returned or admitted. Other contracts keep the
/// pinned validator's original diagnostic precedence.
pub(crate) fn schema_first_error(
    registry: &Registry,
    contract: &str,
    profile: &str,
    value: &Value,
    original: ValidationIssue,
) -> ValidationIssue {
    if contract != "ProjectCreate" || profile != "structural" || original.code != "NONFINITE_NUMBER"
    {
        return original;
    }
    let Ok(schema) = registry.load_schema(
        "https://cirnet.local/contracts/public/projects/1.0/schema.json#/$defs/ProjectCreate",
    ) else {
        return original;
    };
    let Some(properties) = schema["properties"].as_object() else {
        return original;
    };
    let string_only = properties.len() == 2
        && ["name", "description"].iter().all(|field| {
            properties
                .get(*field)
                .is_some_and(|property| property["type"] == "string")
        });
    if schema["type"] != "object" || schema["additionalProperties"] != false || !string_only {
        return original;
    }
    let mut diagnostic_value = if let Some(fields) = value.as_object() {
        // Python checks properties in schema order. The native schema
        // iterator can instead follow the request's member order.
        let known = properties
            .keys()
            .filter_map(|key| fields.get(key).map(|value| (key.clone(), value.clone())));
        let other = fields
            .iter()
            .filter(|(key, _)| !properties.contains_key(*key))
            .map(|(key, value)| (key.clone(), value.clone()));
        Value::Object(known.chain(other).collect())
    } else {
        value.clone()
    };
    replace_nonfinite(&mut diagnostic_value);
    if let Err(ValidationError::Invalid(mut shape)) =
        registry.validate(contract, profile, &diagnostic_value)
        && shape.code.starts_with("SCHEMA_")
    {
        if value.pointer(&shape.path).is_some_and(nonfinite) {
            shape.code = "NONFINITE_NUMBER".into();
            shape.message = "Nonfinite numeric value".into();
        }
        shape
    } else {
        original
    }
}

fn nonfinite(value: &Value) -> bool {
    value.as_number().is_some_and(|number| {
        number.as_str().contains(['.', 'e', 'E'])
            && number.as_f64().is_none_or(|value| !value.is_finite())
    })
}

fn replace_nonfinite(value: &mut Value) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(replace_nonfinite),
        Value::Object(fields) => fields.values_mut().for_each(replace_nonfinite),
        value if nonfinite(value) => *value = json!(0),
        _ => {}
    }
}

pub(crate) fn python_bytes_repr(bytes: &[u8]) -> String {
    let quote = if bytes.contains(&b'\'') && !bytes.contains(&b'"') {
        b'"'
    } else {
        b'\''
    };
    let mut text = String::from("b");
    text.push(char::from(quote));
    for &byte in bytes {
        match byte {
            b'\\' => text.push_str("\\\\"),
            b'\t' => text.push_str("\\t"),
            b'\n' => text.push_str("\\n"),
            b'\r' => text.push_str("\\r"),
            byte if byte == quote => {
                text.push('\\');
                text.push(char::from(byte));
            }
            b' '..=b'~' => text.push(char::from(byte)),
            byte => {
                write!(&mut text, "\\x{byte:02x}").expect("writing to a string");
            }
        }
    }
    text.push(char::from(quote));
    text
}

fn issue(code: &str, path: &str, profile: &str) -> ApiError {
    ApiError::new("REQUEST_VALIDATION_ERROR", 422).with_issues(vec![json!({
        "code": code, "path": path, "severity": "error", "profile": profile,
        "message": "The request field does not match its declared contract.",
    })])
}

fn invalid_json(source: &str, byte: usize) -> ApiError {
    let mut byte = byte.min(source.len());
    while !source.is_char_boundary(byte) {
        byte -= 1;
    }
    let offset = source[..byte].chars().count();
    issue("json_invalid", &format!("/body/{offset}"), "http-request")
}

fn serde_error_byte(source: &str, error: &serde_json::Error) -> usize {
    if error.is_eof() {
        return source.len();
    }
    let preceding_lines = source
        .split_inclusive('\n')
        .take(error.line().saturating_sub(1));
    preceding_lines.map(str::len).sum::<usize>() + error.column().saturating_sub(1)
}

struct SyntaxProbe<'a> {
    source: &'a [u8],
    cursor: usize,
    repaired: Option<(Vec<u8>, usize)>,
}

impl<'a> SyntaxProbe<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source: source.as_bytes(),
            cursor: 0,
            repaired: None,
        }
    }

    fn inspect(mut self) -> Result<Option<Vec<u8>>, usize> {
        self.value(0)?;
        self.whitespace();
        if self.cursor != self.source.len() {
            return Err(self.cursor);
        }
        Ok(self.repaired.map(|(mut repaired, previous)| {
            repaired.extend_from_slice(&self.source[previous..]);
            repaired
        }))
    }

    fn peek(&self) -> Option<u8> {
        self.source.get(self.cursor).copied()
    }

    fn take(&mut self, byte: u8) -> bool {
        if self.peek() == Some(byte) {
            self.cursor += 1;
            true
        } else {
            false
        }
    }

    fn whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\r' | b'\n' | b'\t')) {
            self.cursor += 1;
        }
    }

    fn value(&mut self, depth: usize) -> Result<(), usize> {
        self.whitespace();
        if depth >= 128 {
            return Err(self.cursor);
        }
        match self.peek() {
            Some(b'{') => self.collection(depth + 1, b'}'),
            Some(b'[') => self.collection(depth + 1, b']'),
            Some(b'"') => self.string(),
            Some(b'n') => self.literal(b"null", false),
            Some(b't') => self.literal(b"true", false),
            Some(b'f') => self.literal(b"false", false),
            Some(b'N') => self.literal(b"NaN", true),
            Some(b'I') => self.literal(b"Infinity", true),
            Some(b'-') if self.source[self.cursor..].starts_with(b"-Infinity") => {
                self.literal(b"-Infinity", true)
            }
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => Err(self.cursor),
        }
    }

    fn literal(&mut self, literal: &[u8], nonfinite: bool) -> Result<(), usize> {
        let start = self.cursor;
        if !self.source[start..].starts_with(literal) {
            return Err(start);
        }
        self.cursor += literal.len();
        if nonfinite {
            let (repaired, previous) = self
                .repaired
                .get_or_insert_with(|| (Vec::with_capacity(self.source.len()), 0));
            repaired.extend_from_slice(&self.source[*previous..start]);
            // Preserve a numeric token for the pinned Contracts finite check,
            // without colliding with an ordinary string, null, or finite value.
            repaired.extend_from_slice(b"1e9999");
            *previous = self.cursor;
        }
        Ok(())
    }

    fn collection(&mut self, depth: usize, closing: u8) -> Result<(), usize> {
        self.cursor += 1;
        self.whitespace();
        if self.take(closing) {
            return Ok(());
        }
        loop {
            if closing == b'}' {
                self.string()?;
                self.whitespace();
                if !self.take(b':') {
                    return Err(self.cursor);
                }
            }
            self.value(depth)?;
            self.whitespace();
            if self.take(closing) {
                return Ok(());
            }
            let separator = self.cursor;
            if !self.take(b',') {
                return Err(separator);
            }
            self.whitespace();
            if self.peek() == Some(closing) {
                return Err(separator);
            }
        }
    }

    fn string(&mut self) -> Result<(), usize> {
        let start = self.cursor;
        if !self.take(b'"') {
            return Err(start);
        }
        while let Some(byte) = self.peek() {
            let position = self.cursor;
            self.cursor += 1;
            match byte {
                b'"' => return Ok(()),
                b'\\' => match self.peek() {
                    Some(b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't') => {
                        self.cursor += 1
                    }
                    Some(b'u') => {
                        let code = self.cursor;
                        self.cursor += 1;
                        let digits = self
                            .source
                            .get(self.cursor..self.cursor + 4)
                            .filter(|digits| digits.iter().all(u8::is_ascii_hexdigit));
                        if digits.is_none() {
                            return Err(code);
                        }
                        self.cursor += 4;
                    }
                    Some(_) => return Err(position),
                    None => return Err(start),
                },
                0..=0x1f => return Err(position),
                _ => {}
            }
        }
        Err(start)
    }

    fn number(&mut self) -> Result<(), usize> {
        let start = self.cursor;
        self.take(b'-');
        if !self.take(b'0') {
            if !matches!(self.peek(), Some(b'1'..=b'9')) {
                return Err(start);
            }
            self.digits();
        }
        if self.peek() == Some(b'.')
            && self
                .source
                .get(self.cursor + 1)
                .is_some_and(u8::is_ascii_digit)
        {
            self.cursor += 1;
            self.digits();
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            let mut exponent = self.cursor + 1;
            if matches!(self.source.get(exponent), Some(b'+' | b'-')) {
                exponent += 1;
            }
            if self.source.get(exponent).is_some_and(u8::is_ascii_digit) {
                self.cursor = exponent;
                self.digits();
            }
        }
        Ok(())
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.cursor += 1;
        }
    }
}

#[cfg(test)]
#[path = "../tests/http_body_cases.rs"]
mod tests;

//! Integer query decoding compatible with the pinned FastAPI/Pydantic boundary.
use serde_json::json;

use crate::error::ApiError;

const MAX_SIGNIFICANT_DIGITS: usize = 4300;

pub(crate) fn bounded_int(
    raw: &str,
    name: &str,
    minimum: i64,
    maximum: i64,
) -> Result<i64, ApiError> {
    let error = |code| validation_issue(name, code);
    // The pinned parser's initial JSON integer scan reports its dedicated
    // size error before it tries whitespace, plus, zero, or underscore cleanup.
    let initial = raw.strip_prefix('-').unwrap_or(raw);
    if initial.len() > MAX_SIGNIFICANT_DIGITS
        && initial
            .as_bytes()
            .first()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
        && initial
            .bytes()
            .take(MAX_SIGNIFICANT_DIGITS + 1)
            .all(|byte| byte.is_ascii_digit())
    {
        return Err(error("int_parsing_size"));
    }

    let trimmed = raw.trim();
    let negative = trimmed.starts_with('-');
    let unsigned = trimmed.strip_prefix(['-', '+']).unwrap_or(trimmed);
    let integer = match unsigned.split_once('.') {
        Some((integer, fractional))
            if !fractional.is_empty() && fractional.bytes().all(|byte| byte == b'0') =>
        {
            integer
        }
        Some(_) => return Err(error("int_parsing")),
        None => unsigned,
    };
    let mut value = Some(0i64);
    let mut significant_digits = 0;
    let mut previous_digit = false;
    for byte in integer.bytes() {
        if byte == b'_' && previous_digit {
            previous_digit = false;
            continue;
        }
        if !byte.is_ascii_digit() {
            return Err(error("int_parsing"));
        }
        previous_digit = true;
        let digit = i64::from(byte - b'0');
        if significant_digits != 0 || digit != 0 {
            significant_digits += 1;
            if significant_digits > MAX_SIGNIFICANT_DIGITS {
                return Err(error("int_parsing"));
            }
        }
        value = value
            .and_then(|value| value.checked_mul(10))
            .and_then(|value| {
                if negative {
                    value.checked_sub(digit)
                } else {
                    value.checked_add(digit)
                }
            });
    }
    if !previous_digit {
        return Err(error("int_parsing"));
    }
    match value {
        Some(value) if value < minimum => Err(error("greater_than_equal")),
        Some(value) if value > maximum => Err(error("less_than_equal")),
        Some(value) => Ok(value),
        None if negative => Err(error("greater_than_equal")),
        None => Err(error("less_than_equal")),
    }
}

pub(crate) fn validation_issue(name: &str, code: &str) -> ApiError {
    ApiError::new("REQUEST_VALIDATION_ERROR", 422).with_issues(vec![json!({
        "code": code, "path": format!("/query/{name}"), "severity": "error", "profile": "http-request",
        "message": "The request field does not match its declared contract.",
    })])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Result<i64, String> {
        bounded_int(raw, "limit", 1, 100).map_err(|error| {
            assert_eq!(error.status, 422);
            assert_eq!(error.code, "REQUEST_VALIDATION_ERROR");
            assert_eq!(error.issues[0]["path"], "/query/limit");
            error.issues[0]["code"].as_str().unwrap().to_owned()
        })
    }

    #[test]
    fn pinned_integer_query_grammar_and_range() {
        for (token, value) in [
            ("1", 1),
            ("+1", 1),
            ("001", 1),
            ("1.0", 1),
            ("+1.0", 1),
            ("001.000", 1),
            ("1_0", 10),
            ("1_00", 100),
            ("1_0_0", 100),
            (" 1 ", 1),
            ("\t+01.0\n", 1),
            (" 001_0.0 ", 10),
            ("100.0", 100),
            ("0000000000000000000000001", 1),
            ("\u{a0}1\u{a0}", 1),
            ("\u{2003}1\u{2003}", 1),
            ("\u{85}1\u{85}", 1),
            ("\u{202f}1\u{202f}", 1),
        ] {
            assert_eq!(parse(token), Ok(value), "{token:?}");
        }
        for token in [
            "",
            "1.01",
            "1e0",
            "1e+0",
            "1e2",
            "_10",
            "10_",
            "1_.0",
            "1._0",
            "1.0_0",
            "1.",
            "1.00.0",
            ".0",
            "1,0",
            "--1",
            "１００",
            "١",
            "\u{1f}1\u{1f}",
            "1 0",
            "1\t0",
            "1__0",
            "+ 1",
            ".00",
        ] {
            assert_eq!(parse(token), Err("int_parsing".into()), "{token:?}");
        }
        for token in ["-0.0", "+0.0", "-1", "-1.0", "-0_0", "-9223372036854775809"] {
            assert_eq!(parse(token), Err("greater_than_equal".into()), "{token}");
        }
        for token in ["101.0", "9223372036854775808"] {
            assert_eq!(parse(token), Err("less_than_equal".into()), "{token}");
        }
    }

    #[test]
    fn pinned_query_reports_size_before_plain_numeric_suffixes() {
        let maximum = "9".repeat(MAX_SIGNIFICANT_DIGITS);
        let excessive = maximum.clone() + "9";
        for token in [
            excessive.clone(),
            format!("-{excessive}"),
            format!("{excessive}.1"),
            format!("{excessive}_0"),
            format!("{excessive} "),
            format!("{excessive}a"),
        ] {
            assert_eq!(parse(&token), Err("int_parsing_size".into()));
        }
        for token in [
            format!("+{excessive}"),
            format!(" {excessive}"),
            format!("0{excessive}"),
            format!("1_{excessive}"),
            format!("{maximum}_9"),
            format!("{maximum}a"),
            "9_".repeat(MAX_SIGNIFICANT_DIGITS) + "9",
            format!("1.{}", excessive),
        ] {
            assert_eq!(parse(&token), Err("int_parsing".into()));
        }
        let zeroes = "0".repeat(MAX_SIGNIFICANT_DIGITS + 1);
        assert_eq!(parse(&format!("{zeroes}1")), Ok(1));
        assert_eq!(parse(&format!("1.{zeroes}")), Ok(1));
        assert_eq!(
            parse(&("0_".repeat(MAX_SIGNIFICANT_DIGITS + 1) + "1")),
            Ok(1)
        );
        assert_eq!(parse(&maximum), Err("less_than_equal".into()));
    }
}

//! Numeric conversions for JSON values already parsed at a Contracts boundary.
use std::cmp::Ordering;

use serde_json::{Number, Value};

fn integer_token(number: &Number) -> bool {
    !number.as_str().contains(['.', 'e', 'E'])
}

pub(crate) fn integral_float(value: &Value) -> Option<f64> {
    let number = value.as_number()?;
    if integer_token(number) {
        return None;
    }
    number
        .as_f64()
        .filter(|number| number.is_finite() && number.fract() == 0.0)
}

pub(crate) fn bounded_integer(value: &Value, minimum: i64, maximum: i64) -> Option<i64> {
    let value = if let Some(integer) = value.as_i64() {
        integer
    } else {
        let float = integral_float(value)?;
        // i64::MAX rounds to 2^63 as f64; that endpoint cannot be cast.
        if float < i64::MIN as f64 || float >= i64::MAX as f64 {
            return None;
        }
        float as i64
    };
    (minimum..=maximum).contains(&value).then_some(value)
}

/// Python orders arbitrary-precision integer tokens against binary64 floats
/// exactly. In particular, an integer just outside a hardware limit must not
/// round onto that limit before the comparison.
pub(crate) fn compare_numbers(left: &Value, right: &Value) -> Option<Ordering> {
    let left = left.as_number()?;
    let right = right.as_number()?;
    match (integer_token(left), integer_token(right)) {
        (true, true) => Some(compare_integers(left.as_str(), right.as_str())),
        (true, false) => Some(compare_integer_to_float(
            left.as_str(),
            finite_float(right)?,
        )),
        (false, true) => {
            Some(compare_integer_to_float(right.as_str(), finite_float(left)?).reverse())
        }
        (false, false) => finite_float(left)?.partial_cmp(&finite_float(right)?),
    }
}

fn finite_float(number: &Number) -> Option<f64> {
    number.as_f64().filter(|number| number.is_finite())
}

fn compare_integer_to_float(integer: &str, float: f64) -> Ordering {
    let integral = float.trunc();
    // Fixed precision displays the exact integral binary64 value, including
    // large integers for which the shortest round-trippable decimal differs.
    let comparison = compare_integers(integer, &format!("{integral:.0}"));
    if comparison == Ordering::Equal {
        integral.partial_cmp(&float).expect("finite float")
    } else {
        comparison
    }
}

fn compare_integers(left: &str, right: &str) -> Ordering {
    fn sign_and_digits(integer: &str) -> (bool, &str) {
        let digits = integer.trim_start_matches('-').trim_start_matches('0');
        (integer.starts_with('-') && !digits.is_empty(), digits)
    }
    let (left_negative, left_digits) = sign_and_digits(left);
    let (right_negative, right_digits) = sign_and_digits(right);
    if left_negative != right_negative {
        return right_negative.cmp(&left_negative);
    }
    let magnitude = left_digits
        .len()
        .cmp(&right_digits.len())
        .then_with(|| left_digits.cmp(right_digits));
    if left_negative {
        magnitude.reverse()
    } else {
        magnitude
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_integer_accepts_integral_float_without_rounding_integer_tokens() {
        for (token, expected) in [
            ("1", Some(1)),
            ("1.0", Some(1)),
            ("1e1", Some(10)),
            ("1.5", None),
            ("true", None),
            ("9223372036854775807", Some(i64::MAX)),
            ("9223372036854775808", None),
            ("9223372036854775807.0", None),
            ("-9223372036854775808.0", Some(i64::MIN)),
        ] {
            let value = serde_json::from_str(token).unwrap();
            assert_eq!(
                bounded_integer(&value, i64::MIN, i64::MAX),
                expected,
                "{token}"
            );
        }
        let above_safe: Value = serde_json::from_str("9007199254740992.0").unwrap();
        assert_eq!(bounded_integer(&above_safe, 1, 9_007_199_254_740_991), None);
    }
}

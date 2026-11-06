//! Best-effort diagnostics for paths that own safety cleanup.
use std::{
    fmt,
    io::{self, Write},
};

#[doc(hidden)]
pub fn safety_log(message: fmt::Arguments<'_>) {
    write_line(io::stderr().lock(), message);
}

fn write_line(mut output: impl Write, message: fmt::Arguments<'_>) {
    let _ = writeln!(output, "{message}");
}

#[cfg(test)]
mod safety_regression {
    use super::*;

    struct BrokenPipe;
    impl Write for BrokenPipe {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::Error::from(io::ErrorKind::BrokenPipe))
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn broken_diagnostic_output_does_not_panic() {
        write_line(BrokenPipe, format_args!("cleanup error {}", "UNAVAILABLE"));
        let mut output = Vec::new();
        write_line(&mut output, format_args!("cleanup error {}", "UNAVAILABLE"));
        assert_eq!(output, b"cleanup error UNAVAILABLE\n");
    }
}

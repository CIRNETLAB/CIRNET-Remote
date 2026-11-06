use cirnet_contracts_native::hardware_v2;
use prost::Message;
use prost_types::FileDescriptorSet;
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    for (descriptor, package) in [
        (hardware_v2::FILE_DESCRIPTOR_SET, ".cirnet.hardware.v2"),
        (
            hardware_v2::LEGACY_FILE_DESCRIPTOR_SET,
            ".netcircuit.hardware.v2",
        ),
    ] {
        tonic_prost_build::configure()
            .build_client(true)
            .build_server(false)
            .extern_path(package, "::cirnet_contracts_native::hardware_v2")
            .compile_fds(FileDescriptorSet::decode(descriptor)?)?;
    }
    Ok(())
}

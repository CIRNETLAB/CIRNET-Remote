import type { AssetDescriptor } from '../application/assets/AssetProvider'

/** Revisions are SHA-256 of the owned self-contained GLBs. Tests verify these
 * bytes against the delivered files; changing an export requires a new revision.
 * Sources: the adjacent public/models READMEs and reproducible export scripts.
 */
export const instrumentAssets={
  oscilloscope:{url:'/models/oscilloscope-2ch/oscilloscope-2ch.glb',
    revision:'76cb200a71798a260fca2607d9e635b62878d3a29c9d028bde1dc8100989ddc2',maxBytes:2_000_000},
  generator:{url:'/models/function-generator-2ch/function-generator-2ch.glb',
    revision:'b53ddb1cdb2106fb1980e681446ed5a4b8da4e208e1dba87d596ee90d070611f',maxBytes:2_000_000},
} satisfies Record<string,AssetDescriptor>
export type InstrumentAssetKind=keyof typeof instrumentAssets

export interface ArtifactContext { version?: 1; owner: string; roots: string[] }
export function getArtifactContext(options?: { context?: ArtifactContext }): Required<ArtifactContext>
export function getArtifactDirectory(subdirectory?: string, options?: { directory?: string; context?: ArtifactContext }): string
export function validateArtifactDirectory(directory: string, options?: { context?: ArtifactContext }): string
export function cleanupArtifactSession(directory: string, options?: { context?: ArtifactContext }): void
export function runArtifactCli(args?: string[]): void
export const runCli: typeof runArtifactCli

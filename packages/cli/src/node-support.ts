export const MINIMUM_NODE_MAJOR = 24;

export function isNodeVersionSupported(version: string): boolean {
  const major = Number(version.match(/^v?(\d+)/)?.[1]);
  return Number.isInteger(major) && major >= MINIMUM_NODE_MAJOR;
}

export function helper(name: string): string {
  return `hello ${name}`;
}

export interface HelperOptions {
  loud?: boolean;
}

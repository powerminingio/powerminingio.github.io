import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Production serves from a GitHub Pages subpath (see next.config.js). Anything
 * under public/ referenced by hand needs this prefix or it 404s there.
 */
export const basePath = process.env.NODE_ENV === 'production' ? '/bitaxe-web-flasher' : ''

/** Absolute URL for a file in public/, correct in both dev and production. */
export function asset(path: string) {
  return `${basePath}${path}`
}
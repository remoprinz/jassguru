import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Checks if the current path is a public route.
 * @param path The path to check.
 * @returns True if the path is public, false otherwise.
 */
export const isPublicPath = (path: string): boolean => {
  // Normalize path by removing trailing slash if it exists and isn't just "/"
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  const publicPaths = [
    '/',
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    '/agb',
    '/datenschutz',
    '/impressum',
    '/clear-cache',
    '/join',
    '/features'
  ];

  // Check for exact matches against the normalized path
  if (publicPaths.includes(normalizedPath)) {
    return true;
  }

  // Check for public path prefixes
  if (normalizedPath.startsWith('/wissen') ||
      normalizedPath.startsWith('/view') ||
      normalizedPath.startsWith('/profile')) {
    return true;
  }

  return false;
};

/**
 * Converts a string to a URL-friendly slug.
 * @param str The string to convert.
 * @returns The slugified string.
 */
export const toSlug = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/(^-|-$)+/g, '');
};

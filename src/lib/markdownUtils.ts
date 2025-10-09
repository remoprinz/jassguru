export const stripMarkdown = (markdown: string): string => {
  return markdown
    // Remove headings
    .replace(/#{1,6}\s+(.*)/g, '$1')
    // Remove bold and italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+(.*)/gm, '$1')
    // Remove horizontal rules
    .replace(/^-{3,}|^\*{3,}|^_{3,}/gm, '')
    // Remove links, keeping the text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove lists (unordered and ordered)
    .replace(/^\s*[-*+]\s+(.*)/gm, '$1')
    .replace(/^\s*\d+\.\s+(.*)/gm, '$1')
    // Replace multiple newlines with a single space for paragraph detection
    .replace(/\n{2,}/g, '\n\n')
    // Remove remaining newlines that are not paragraph breaks
    .replace(/\n/g, ' ')
    .trim();
};

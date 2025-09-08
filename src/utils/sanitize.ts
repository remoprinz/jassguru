export const sanitizeInput = (input: string): string => {
  // Replace < and > to prevent HTML/XML tag injection
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

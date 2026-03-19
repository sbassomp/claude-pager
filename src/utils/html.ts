export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markdownToHtml(md: string): string {
  const escaped = escapeHtml(md);
  let result = '';
  let inCodeBlock = false;

  for (const line of escaped.split('\n')) {
    if (line.match(/^```/)) {
      if (inCodeBlock) {
        result += '</pre>\n';
        inCodeBlock = false;
      } else {
        result += '<pre>';
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      result += line + '\n';
      continue;
    }

    let converted = line;
    converted = converted.replace(/^#{1,3}\s+(.+)$/, '<b>$1</b>');
    converted = converted.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    converted = converted.replace(/__(.+?)__/g, '<b>$1</b>');
    converted = converted.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
    converted = converted.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');
    converted = converted.replace(/`([^`]+?)`/g, '<code>$1</code>');
    converted = converted.replace(/^(\s*)[-*]\s+/, '$1• ');

    result += converted + '\n';
  }

  if (inCodeBlock) {
    result += '</pre>\n';
  }

  return result.trimEnd();
}

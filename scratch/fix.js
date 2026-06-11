const fs = require('fs');

function replaceInFile(path, replacer) {
  if (!fs.existsSync(path)) return;
  let content = fs.readFileSync(path, 'utf8');
  let newContent = replacer(content);
  if (content !== newContent) {
    fs.writeFileSync(path, newContent);
    console.log('Updated ' + path);
  }
}

// 1. Fix euro sign
['src/components/tables/TableDetailModal.tsx', 'src/pages/Dashboard/LiveTablesView.tsx'].forEach(p => {
  replaceInFile('../apps/frontend/' + p, c => c.replace(/&euro;/g, '€'));
});

// 2. Fix vs spacing in KpiCard
replaceInFile('../apps/frontend/src/components/dashboard/KpiCard.tsx', c => {
  return c.replace(/\{t\('auto\.vs', 'vs'\)\}\{comparisonLabel\}/g, '{t(\'auto.vs\', \'vs\')} {comparisonLabel}');
});

// 3. Fix getElapsedLabel and SourceBadge in OrdersView & TableDetailModal
['src/pages/Dashboard/OrdersView.tsx', 'src/components/tables/TableDetailModal.tsx'].forEach(p => {
  replaceInFile('../apps/frontend/' + p, c => {
    let result = c;
    result = result.replace(/function getElapsedLabel\([^)]*\)\s*\{/g, 'function getElapsedLabel(createdAt: string | undefined, t: any) {');
    result = result.replace(/getElapsedLabel\(([^)]+)\)/g, 'getElapsedLabel($1, t)');
    result = result.replace(/return 'just now';/g, 'return t(\'auto.justNow\', \'just now\');');
    result = result.replace(/return '1 min ago';/g, 'return t(\'auto.1MinAgo\', \'1 min ago\');');
    result = result.replace(/return `\$\{diffMinutes\} min ago`;/g, 'return t(\'auto.minAgo\', \'{{min}} min ago\', { min: diffMinutes });');
    result = result.replace(/return hours === 1 \? '1 hour ago' : `\$\{hours\} hours ago`;/g, 'return hours === 1 ? t(\'auto.1HourAgo\', \'1 hour ago\') : t(\'auto.hoursAgo\', \'{{hours}} hours ago\', { hours });');
    
    result = result.replace(/const roleName =([^;]+);/, (match, group) => {
      return match + "\n  const translatedRole = roleStr ? t(`roles.${roleStr.toLowerCase()}`, roleName) : t('roles.staff', 'Staff');";
    });
    result = result.replace(/\{roleName\}: \{name\}/g, '{translatedRole}: {name}');
    
    return result;
  });
});

// 4. Fix formatTime and formatDate locale
['src/pages/Dashboard/OrdersView.tsx', 'src/components/tables/TableDetailModal.tsx'].forEach(p => {
  replaceInFile('../apps/frontend/' + p, c => {
    let res = c;
    res = res.replace(/function formatTime\(([^)]*)\)\s*\{/, 'function formatTime($1, locale: string = \'en-US\') {');
    res = res.replace(/function formatDate\(([^)]*)\)\s*\{/, 'function formatDate($1, locale: string = \'en-US\') {');
    res = res.replace(/toLocaleTimeString\(\[\]/g, 'toLocaleTimeString(locale');
    res = res.replace(/toLocaleDateString\(\[\]/g, 'toLocaleDateString(locale');
    
    res = res.replace(/formatTime\(([^,)]+)\)/g, 'formatTime($1, i18n.language)');
    res = res.replace(/formatDate\(([^,)]+)\)/g, 'formatDate($1, i18n.language)');
    
    res = res.replace(/const \{ t \} = useTranslation\(\);/g, 'const { t, i18n } = useTranslation();');
    return res;
  });
});

// 5. Fix Call Waiter Tab 183 hours
replaceInFile('../apps/frontend/src/pages/Dashboard/WaiterCallsView.tsx', c => {
    let res = c;
    // getElapsedLabel in WaiterCallsView?
    res = res.replace(/function getElapsedLabel\([^)]*\)\s*\{/g, 'function getElapsedLabel(createdAt: string | undefined, t: any) {');
    res = res.replace(/getElapsedLabel\(([^)]+)\)/g, 'getElapsedLabel($1, t)');
    res = res.replace(/return 'just now';/g, 'return t(\'auto.justNow\', \'just now\');');
    res = res.replace(/return '1 min ago';/g, 'return t(\'auto.1MinAgo\', \'1 min ago\');');
    res = res.replace(/return `\$\{diffMinutes\} min ago`;/g, 'return t(\'auto.minAgo\', \'{{min}} min ago\', { min: diffMinutes });');
    res = res.replace(/return hours === 1 \? '1 hour ago' : `\$\{hours\} hours ago`;/g, 'return hours === 1 ? t(\'auto.1HourAgo\', \'1 hour ago\') : t(\'auto.hoursAgo\', \'{{hours}} hours ago\', { hours });');
    
    res = res.replace(/const \{ t \} = useTranslation\(\);/g, 'const { t, i18n } = useTranslation();');
    return res;
});

console.log('Done');

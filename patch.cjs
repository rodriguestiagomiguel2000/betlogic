const fs = require('fs');
let content = fs.readFileSync('src/components/BankrollManager.tsx', 'utf-8');
content = content.replace(
  'const bankrollAnalytics = useMemo(() => {',
  "const bankrollAnalytics = useMemo(() => {\n    console.log('bankrollAnalytics recomputing');"
);
fs.writeFileSync('src/components/BankrollManager.tsx', content);

const fs = require('fs');
let content = fs.readFileSync('src/components/BankrollManager.tsx', 'utf-8');

// I need to replace the entire `bankrollAnalytics` useMemo block with the split ones.
// I will use regex or just standard replace if I can match exactly.

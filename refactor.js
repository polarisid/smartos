const fs = require('fs');
const path = require('path');

const pageFile = path.join(__dirname, 'src', 'app', 'page.tsx');
let content = fs.readFileSync(pageFile, 'utf8');

// The exact string to locate the start of PerformanceDashboard
const pdStart = 'function PerformanceDashboard({ technicians, serviceOrders, returns, indicators, chargebacks }: {';
const ssStart = 'function SearchableSelect({';

const pdIndex = content.indexOf(pdStart);
const ssIndex = content.indexOf(ssStart);

if (pdIndex === -1 || ssIndex === -1) {
    console.error("Could not find functions to replace.");
    process.exit(1);
}

// Remove the block roughly from PerformanceDashboard to ReturnsRanking (exclusive of SearchableSelect)
content = content.substring(0, pdIndex) + content.substring(ssIndex);

// Add imports near the top
const lastImportIndex = content.lastIndexOf('import ');
const endOfLastImport = content.indexOf('\n', lastImportIndex);

const importsToAdd = `
import { PerformanceDashboard } from "@/components/dashboard/PerformanceDashboard";
import { ReturnsRanking } from "@/components/dashboard/ReturnsRanking";
`;

content = content.substring(0, endOfLastImport + 1) + importsToAdd + content.substring(endOfLastImport + 1);

fs.writeFileSync(pageFile, content, 'utf8');
console.log("Successfully refactored page.tsx");

# Flockbook roadmap

## 1. Production prototype
React interface with demo login and a yolk-yellow theme. One daily production entry for laying hens, egg collection, feed in metric tonnes, and damaged eggs. Separate customer sales entries allow multiple sales per day, each with its own tray quantity, INR price per tray, and optional percentage discount. Editable records, calculated inventory, monthly/quarterly charts, laying rate, feed efficiency, and period comparisons. Configurable opening stock and tray size (default 30). Arrays saved in browser storage, with backup export/import and migration of previous combined records. Responsive static Vite build for Vercel.

## 2. Owner review and pilot
Review units and farm workflow. Use one browser per farm and export daily backups: records are device-local and do not synchronize. Demo sign-in is not security. Agree on flock history, mortality, and stock adjustments before production.

## 3. Production release
Replace browser storage with an authenticated API and database. Add real accounts, farm isolation, roles, backups, audit trails, server validation, and concurrency control. Reconcile and migrate pilot records. Test recovery, permissions, and offline needs.

## 4. Finance and extensions
Customer accounts, invoices, payments, expenses, feed purchases, balances, profitability and cash flow. Multiple sheds, health records and alerts as approved.

## Calculation rules
Inventory = opening stock + collected eggs - all customers' trays sold * eggs per tray - damaged eggs. Reject a negative closing balance on any date. One editable production record and unlimited customer sale entries per day, with no future dates. Sales may draw from existing stock on days without production. Bird count means live laying hens that day. Laying rate uses total eggs / total bird-days. Feed is metric tonnes (1 tonne = 1,000 kg). Missing dates are not zero-production days; comparisons use recorded-day averages. Opening stock precedes the earliest entry. Price is per tray in INR; each sale's discount is a percentage and the final sale amount is rounded to paise. Discounts affect sale value, never inventory quantity.

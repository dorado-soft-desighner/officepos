# POS System Requirements & Technical Specification
## Project: Perfume & Essence Management System (Wholesale & Retail)

මෙම ලේඛනය මගින් Perfume සහ Essence අලෙවි කරන ආයතනයක් සඳහා අවශ්‍ය වන POS (Point of Sale) පද්ධතියේ සම්පූර්ණ සැලසුම ඉදිරිපත් කරයි.

---

## 1. Business Requirements (ව්‍යාපාරික අවශ්‍යතා)

මෙම පද්ධතිය මගින් සිල්ලර (Retail) සහ තොග (Wholesale) යන අංශ දෙකම ආවරණය විය යුතුය.

### 1.1 Inventory Management (තොග කළමනාකරණය)
* **Product Categories:** සුවඳ විලවුන් (Finished Perfumes) සහ එසන්ස් (Essences) ලෙස වර්ගීකරණය කිරීම.
* **Unit of Measurement (UOM):** * Perfumes: Bottles/Units වලින්.
    * Essences: Milliliters (ml) හෝ Grams (g) වලින්.
* **Pricing Logic:** එක් නිෂ්පාදනයක් සඳහා මිල ගණන් දෙකක් තිබිය යුතුය:
    1. Retail Price (සිල්ලර මිල).
    2. Wholesale Price (තොග මිල - අවම ප්‍රමාණය මත පදනම් වූ).
* **Stock Alerts:** අමුද්‍රව්‍ය හෝ පර්ෆියුම් තොගය අවසන් වීමට ආසන්න වන විට (Low Stock) දැනුම් දීම.

### 1.2 Sales & Billing (විකුණුම් සහ බිල්පත්)
* **Dual Mode Billing:** එකම පද්ධතියකින් සිල්ලර පාරිභෝගිකයින්ට සහ තොග ගැනුම්කරුවන්ට බිල්පත් නිකුත් කිරීමේ හැකියාව.
* **Discounts:** අයිතමයකට අදාළව හෝ මුළු බිල්පතට අදාළව වට්ටම් ලබා දීමේ හැකියාව.
* **Measurement Conversion:** එසන්ස් අලෙවි කිරීමේදී ml ප්‍රමාණය අනුව මිල ස්වයංක්‍රීයව ගණනය කිරීම.
* **Receipt Printing:** තාප මුද්‍රණ යන්ත්‍ර (Thermal Printer) මගින් බිල්පත් මුද්‍රණය කිරීමේ හැකියාව.

### 1.3 Customer & Supplier Management
* Wholesale පාරිභෝගිකයින්ගේ තොරතුරු සහ ඔවුන්ගේ ණය සීමාවන් (Credit tracking) කළමනාකරණය.
* සැපයුම්කරුවන්ගෙන් එසන්ස් ඇණවුම් කිරීම සහ ලැබීම් සටහන් කිරීම.

### 1.4 Reports (වාර්තා)
* දෛනික අලෙවි වාර්තා (Daily Sales).
* ලාභ/අලාභ වාර්තා (Profit/Loss).
* වැඩිපුරම අලෙවි වන සුවඳ වර්ග (Best Selling Fragrances).

---

## 2. Technical Requirements (තාක්ෂණික අවශ්‍යතා)

පද්ධතිය සැකසීම සඳහා භාවිතා කළ යුතු තාක්ෂණික මෙවලම්:
* **Frontend:** HTML5, Tailwind CSS (Styling සඳහා).
* **Logic:** Vanilla JavaScript (ES6+).
* **Database:** Dexie.js (IndexedDB පදනම් කරගත් Local Database). මෙය අන්තර්ජාලය නොමැතිව වුවද (Offline) බ්‍රවුසරය තුළ දත්ත ගබඩා කිරීමට ඉඩ ලබා දෙයි.

### 2.1 Database Schema (Dexie.js)
පහත සඳහන් Tables නිර්මාණය කළ යුතුය:
* `products`: id, name, category, retailPrice, wholesalePrice, stockQuantity, unit.
* `sales`: id, date, totalAmount, discount, customerType (Retail/Wholesale), items[ ].
* `customers`: id, name, contact, totalDue.

### 2.2 UI/UX Design (Tailwind CSS)
* **Responsive Dashboard:** ජංගම දුරකථන සහ පරිගණක දෙකටම ගැලපෙන ලෙස.
* **POS Interface:** ඉතා ඉක්මනින් අයිතම තෝරා ගැනීමට (Search/Filter) හැකි අතුරුමුහුණතක්.
* **Modals:** අලුත් බඩු ඇතුළත් කිරීමට සහ සැකසීම් (Settings) සඳහා භාවිතා කිරීම.

### 2.3 System Features Integration
1.  **Offline-First:** Dexie.js භාවිතා කරන බැවින් සියලු දත්ත පරිගණකයේම ගබඩා වන අතර, අවශ්‍ය නම් පසුව Cloud එකකට Backup කිරීමේ හැකියාව තිබිය යුතුය.
2.  **Print Logic:** `window.print()` හෝ විශේෂිත CSS print media queries භාවිතා කර බිල්පත් නිවැරදිව මුද්‍රණය කිරීම.
3.  **Search Functionality:** නම හෝ Code එක අනුව නිෂ්පාදන සෙවීමේ හැකියාව.

---

## 3. Implementation Steps (පද්ධතිය සකසන පියවර)

1.  **Step 1:** HTML සහ Tailwind CSS භාවිතයෙන් මූලික Layout එක සැකසීම (Navigation, POS View, Inventory View).
2.  **Step 2:** Dexie.js සම්බන්ධ කර Database එක Initialize කිරීම.
3.  **Step 3:** නිෂ්පාදන ඇතුළත් කිරීමේ (Product Entry) Form එක සෑදීම සහ දත්ත ගබඩා කිරීම.
4.  **Step 4:** Cart එකක් (විද්‍යුත් කරත්තයක්) නිර්මාණය කර මිල ගණන් සහ බදු ගණනය කිරීමේ Logic සකස් කිරීම.
5.  **Step 5:** 'Checkout' කිරීමේදී දත්ත `sales` table එකට ඇතුළත් කිරීම සහ තොග ප්‍රමාණය (Stock) අඩු කිරීම.
6.  **Step 6:** බිල්පතක් (Invoice) පෙන්වීමට වෙනම මෘදුකාංග කොටසක් සකසා එය මුද්‍රණයට යොමු කිරීම.

---

## 4. Security & Backup
* දත්ත ආරක්ෂාව සඳහා නිතිපතා JSON ගොනුවක් ලෙස දත්ත Download (Export) කර තබා ගැනීමේ පහසුකම එක් කළ යුතුය.
* මුදල් ලේඛන (Transactions) සංස්කරණය කළ හැක්කේ අවසර ලත් පරිශීලකයෙකුට පමණක් වන සේ සැකසීම.
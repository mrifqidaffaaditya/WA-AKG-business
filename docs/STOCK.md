# Stock Integration

Configure real-time stock data for the AI chatbot.

The bot can answer customer questions about product availability by reading stock data from Google Sheets or a MySQL/PostgreSQL database.

## Google Sheets Setup

### Step 1: Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Google Sheets API"
   - Click **Enable**
4. Create a Service Account:
   - **APIs & Services → Credentials**
   - Click **Create Credentials → Service Account**
   - Name: `wa-akg-stock-reader`
   - Click **Done**
5. Create a key:
   - Click on the service account
   - Go to **Keys → Add Key → Create New Key**
   - Select **JSON**
   - Download the JSON file

### Step 2: Save the Credential

```bash
mkdir -p backend/credentials
mv ~/Downloads/your-project-abc123.json backend/credentials/service-account.json
```

### Step 3: Share the Spreadsheet

1. Open your Google Sheets spreadsheet
2. Click **Share** (top right)
3. Add the service account email (found in the JSON file: `client_email`)
4. Give **Viewer** permission
5. Copy the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  This is your SPREADSHEET_ID
   ```

### Step 4: Configure in Admin Panel

1. Go to **Admin Panel → Stok**
2. Select **Google Sheets** as source
3. Configure JSON:
```json
{
  "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "sheet_name": "Stok",
  "header_row": 1,
  "col_name": "A",
  "col_qty": "B",
  "col_price": "C"
}
```
4. Toggle **Aktifkan** on
5. Click **Simpan**
6. Click **Preview Data Stok** to verify

### Google Sheets Format

Your spreadsheet should look like:

| A | B | C |
|---|---|---|
| Nama Produk | Stok | Harga |
| Produk A | 100 | 50000 |
| Produk B | 50 | 75000 |
| Produk C | 200 | 25000 |

- Row 1 = header (configurable via `header_row`)
- Columns A, B, C = product name, stock, price (configurable via `col_name`, `col_qty`, `col_price`)

---

## Database Stock Setup

### MySQL Example

```sql
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama_produk VARCHAR(255) NOT NULL,
  stok INT NOT NULL DEFAULT 0,
  harga DECIMAL(12,2)
);

INSERT INTO products (nama_produk, stok, harga) VALUES
  ('Produk A', 100, 50000),
  ('Produk B', 50, 75000);
```

Configuration in admin panel:
```json
{
  "host": "your-db-host",
  "port": 3306,
  "database": "stok_db",
  "user": "readonly_user",
  "password": "secure_password",
  "table": "products",
  "col_name": "nama_produk",
  "col_qty": "stok",
  "col_price": "harga"
}
```

### PostgreSQL Example

Same structure, select **PostgreSQL** as source type.

Configuration:
```json
{
  "host": "your-db-host",
  "port": 5432,
  "database": "stok_db",
  "user": "readonly_user",
  "password": "secure_password",
  "table": "products",
  "col_name": "nama_produk",
  "col_qty": "stok",
  "col_price": "harga"
}
```

## How Bot Uses Stock Data

Once configured, the bot automatically receives stock context in its system prompt:

```
Konteks Stok Produk (real-time):
- Produk A: 100 pcs - Rp50.000
- Produk B: 50 pcs - Rp75.000
- Produk C: 200 pcs - Rp25.000
```

When a customer asks "Apakah Produk A masih ada?", the bot can answer:
> "Ya, Produk A masih tersedia. Stok saat ini: 100 pcs dengan harga Rp50.000."

## Caching

Stock data is cached for **60 seconds** (configurable in code). This prevents excessive API/database calls when multiple customers ask stock questions simultaneously. Click **Preview Data Stok** or change the config to force a cache refresh.

## Security

- **Google Sheets credentials** are stored only on the server, never exposed to the frontend
- **Database passwords** are stored in the database config JSON (not plain text env vars for external DBs)
- Use a **read-only** database user for stock queries
- Never grant the service account **Editor** access to the spreadsheet

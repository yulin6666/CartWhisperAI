# 🛍️ Product & Order Scanner Feature

## Overview
Implemented a complete product and order scanning feature for the CartWhisper Shopify App. The scanner fetches all products and orders from a Shopify store via GraphQL and saves them to JSON files for local analysis.

## Features

### 1. **Data Collection**
- Fetches all products using Shopify GraphQL Admin API with cursor-based pagination
- Fetches all orders using Shopify GraphQL Admin API with cursor-based pagination
- Supports up to 100 items per request for optimal performance

### 2. **Data Storage**
- Saves products to `data/products.json`
- Saves orders to `data/orders.json`
- Maintains scan history in `data/scan-logs.json`
- All data stored locally using JSON files (no database required)

### 3. **Product Data Captured**
- ID, title, handle, status, product type, vendor, description
- Creation and update timestamps
- Product images (first image with URL and alt text)
- Variants (up to 100 per product) with price, SKU, barcode, weight, inventory
- Collections (up to 10 per product)

### 4. **Order Data Captured**
- Order ID, name, email, phone
- Financial and fulfillment status
- Pricing information (total, subtotal, shipping, tax)
- Currency and timestamps
- Customer information (ID, name, email, phone, creation date)
- Line items (up to 100 per order) with product info and quantity
- Shipping and billing addresses

### 5. **UI Dashboard**
- **Statistics Section**: Shows total products and orders synced
- **Scan Button**: Triggers manual data collection with visual loading state
- **Scan Results**: Displays success/error messages with counts and duration
- **Last Scan Info**: Shows timestamp, status, and metrics from previous scan
- **Data Storage Info**: Displays where data is stored and file structure
- **Preview Tables**: Shows first 10 products and orders in formatted tables

## File Structure

```
cart-whisper-ai/
├── app/
│   ├── routes/
│   │   ├── app.scan.jsx           # Dashboard UI for scanning
│   │   └── api.scan.jsx           # API endpoint for scan action
│   └── utils/
│       └── fileStorage.server.js  # JSON file storage utilities
└── shopify.app.toml               # Updated with required scopes
```

## Key Components

### `app/routes/api.scan.jsx`
- **Endpoint**: `POST /api/scan`
- **Authentication**: Required (Shopify OAuth)
- **Actions**:
  1. Fetches all products and orders via GraphQL
  2. Saves data to JSON files
  3. Records scan log with metrics
  4. Returns success/error response with timing info

### `app/routes/app.scan.jsx`
- **Route**: `/app/scan`
- **Display**: Dashboard with scan controls and data previews
- **Loader**: Returns product/order counts, last scan info, and preview data
- **Features**: Live scan button, result notifications, data statistics

### `app/utils/fileStorage.server.js`
- Provides utility functions for JSON file operations
- Functions: `saveProducts()`, `loadProducts()`, `saveOrders()`, `loadOrders()`, `saveScanLog()`, `getDataDir()`
- Handles directory creation and file parsing

## Shopify Permissions
Updated `shopify.app.toml` with required scopes:
```
scopes = "write_products,read_products,read_orders"
```

## Usage

1. **Run the app**:
   ```bash
   shopify app dev
   ```

2. **Install the app** on your Shopify development store

3. **Navigate to** the Scan page in the app

4. **Click "Scan Now"** to fetch all products and orders

5. **Check results**:
   - View counts and timing on the dashboard
   - See first 10 items in preview tables
   - Data saved to `data/products.json` and `data/orders.json`

## Data Flow

```
Shopify Store
     ↓ (GraphQL API)
app/routes/api.scan.jsx (Fetcher)
     ↓
app/utils/fileStorage.server.js (Save to JSON)
     ↓
data/
├── products.json
├── orders.json
└── scan-logs.json
```

## Technical Details

- **Pagination**: Uses cursor-based pagination with 100 items per request
- **Error Handling**: Captures GraphQL errors and saves to scan logs
- **Performance**: Fetches products and orders concurrently with proper timing
- **State Management**: Uses React Router's useFetcher for form submission
- **UI State**: Loading indicators during scan, success/error notifications

## Next Steps (Optional Enhancements)

1. Add scheduled/automatic scanning (webhooks)
2. Data analysis and insights dashboard
3. Product recommendations based on order history
4. Export functionality (CSV, Excel)
5. Search and filter capabilities for products/orders
6. Real-time sync status updates
7. Data backup and archival

---

**Status**: ✅ Complete and Ready for Use
**Build Status**: ✅ Passes npm run build
**Scopes**: ✅ Configured (read_products, read_orders, write_products)

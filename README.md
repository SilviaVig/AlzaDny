# Alza Dny Filter

A browser extension that helps you find the best discounts on [Alza.cz](https://www.alza.cz) and [Alza.sk](https://www.alza.sk) websites by filtering products with ALZADNY/ALZADNI discount coupons.

## Features

- **Filter by Discount Percentage**: Set a minimum discount threshold (e.g., 50%) and see only products that meet or exceed that discount.
- **Dynamic Loading**: Automatically loads all products in a category while filtering them based on your discount criteria.
- **Visual Highlighting**: Products with qualifying discounts are highlighted for easy identification.
- **Memory Optimization Mode**: Option to remove non-discounted products from the page for better performance on pages with many products.
- **Multilingual Support**: Available in Czech, Slovak, and English.
- **Persistent Settings**: Your discount preferences are remembered per tab.

## How to Use

1. Install the extension
2. Visit Alza.cz or Alza.sk and browse to any product category
3. Click on the extension icon to open the popup
4. Set your minimum discount percentage
5. Click "Load & Filter Products" to begin filtering
6. Only products with ALZADNY/ALZADNI coupons meeting your criteria will be displayed

## Additional Controls

- **Optimize Memory**: Enable this option to completely remove filtered products for better performance (note: you cannot change the discount percentage after filtering when this option is enabled)
- **Stop/Resume**: You can pause and resume the loading process at any time
- **Update**: Change your minimum discount percentage on-the-fly (when not in memory optimization mode)

## Development

This extension is built using vanilla JavaScript and the Chrome Extension Manifest V3.

## Languages

The extension is available in:
- Czech (cs)
- Slovak (sk)
- English (en)
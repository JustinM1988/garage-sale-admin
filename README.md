# Enhanced Garage Sale Admin Console

A modern, secure web application for managing garage sale locations using ArcGIS Online with OAuth2 PKCE authentication.

## ✨ Features

- **🔐 Secure Authentication**: OAuth2 PKCE flow with ArcGIS Online
- **🗺️ Interactive Map**: Add, edit, and delete garage sale locations
- **📱 Responsive Design**: Works on desktop, tablet, and mobile
- **🎨 Modern UI**: Dark theme with glass morphism design
- **📋 Advanced Filtering**: Filter sales by date ranges
- **📊 Admin Tools**: Export data and bulk operations
- **🚀 GitHub Pages Ready**: Easy deployment

## 🚀 Quick Setup

1. **Download and Deploy**:
   - Download this zip file and extract it
   - Upload all files to your GitHub repository
   - Enable GitHub Pages in repository settings
   - Point to the main branch

2. **Configure ArcGIS OAuth**:
   - Go to your [ArcGIS Developers Dashboard](https://developers.arcgis.com/)
   - Create or edit your OAuth application
   - Add this redirect URL: `https://yourusername.github.io/yourrepo/callback.html`
   - Update `CLIENT_ID` in `config.js` if needed

3. **Configure Your Layer**:
   - Update `LAYER_URL` in `config.js` with your ArcGIS Online feature service URL
   - Ensure your layer has fields: `Address`, `Description`, `Date_1`, `EndDate`

## 📋 Layer Requirements

Your ArcGIS Online feature service should have these fields:
- `Address` (Text) - Street address of the garage sale
- `Description` (Text) - Details about items for sale
- `Date_1` (Date) - Start date/time
- `EndDate` (Date) - End date/time
- Geometry: Point features

## 🔧 Configuration

Edit `config.js` to customize:

```javascript
window.CONFIG = {
    CLIENT_ID: "your-arcgis-oauth-client-id",
    PORTAL: "https://www.arcgis.com/sharing/rest",
    LAYER_URL: "https://services3.arcgis.com/.../FeatureServer/0",
    PORTAL_URL: "https://your-org.maps.arcgis.com", 
    CENTER: [-97.323, 27.876], // Map center coordinates
    ZOOM: 13
};
```

## 🛡️ Security Features

- Content Security Policy (CSP) headers
- OAuth2 PKCE flow (more secure than implicit flow)  
- State verification to prevent CSRF attacks
- Token expiry handling
- No sensitive data stored in localStorage
- Referrer policy set to no-referrer

## 📖 Usage

1. **Sign In**: Click "Sign In" and authenticate with your ArcGIS account
2. **Add Sales**: Click "New", then click on the map to place a point
3. **Edit Sales**: Click existing points on the map to edit them
4. **Filter**: Use the dropdown to filter sales by date range
5. **Export**: Admin users can export data to CSV

## 🎨 Theme Support

The app supports three themes:
- **Dark** (default): Modern dark theme with neon accents
- **Dim**: Softer dark theme  
- **Light**: Clean light theme

Click the 🌓 button to cycle through themes.

## 📱 Mobile Responsive

The interface automatically adapts to mobile devices with:
- Stacked layout on narrow screens
- Touch-friendly buttons and inputs
- Optimized map interactions

## 🔍 Browser Compatibility

- Chrome 88+ (recommended)
- Firefox 85+
- Safari 14+
- Edge 88+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### OAuth Not Working
- Verify your CLIENT_ID is correct in config.js
- Check that the callback URL is registered in your ArcGIS app
- Ensure your ArcGIS org allows CORS from your domain

### Layer Not Loading  
- Verify LAYER_URL is correct and accessible
- Check that your feature service is shared publicly or with your organization
- Ensure field names match those in the FIELDS configuration

### Map Not Displaying
- Check browser console for errors
- Verify CSP headers aren't blocking ArcGIS resources
- Test with a basic HTML page first

---

Built with ❤️ using ArcGIS Maps SDK for JavaScript and modern web standards.

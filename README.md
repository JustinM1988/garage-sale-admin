# 🏷️ Enhanced Garage Sale Admin Console

A secure, modern web application for managing garage sale locations in Portland, TX using ArcGIS Online with organization-restricted OAuth2 PKCE authentication.

## ✨ New Features & Improvements

### 🔐 **Enhanced Security**
- **Organization-restricted authentication** - Only City of Portland employees can access
- **OAuth2 PKCE flow** with state verification and CSRF protection
- **Enhanced security headers** and referrer policies
- **Automatic session validation** and organization checking

### 🗺️ **Reliable Leaflet-based Mapping**
- **OpenStreetMap base layer** - No API keys required, always works
- **Custom vibrant markers** - Bright, circular garage sale icons
- **Real-time coordinate display** - See exact location as you move
- **Smooth map interactions** - Click to place, hover for info

### 📅 **Multi-Day Sale Support**
- **Single-day sales**: "7:00 AM - 4:00 PM: Books, clothes"
- **Multi-day sales**: "Friday 7:00 AM - 2:00 PM & Saturday 8:00 AM - 4:00 PM: Books, clothes"
- **Dynamic day management** - Add/remove sale days as needed
- **Auto-generated descriptions** - No manual typing required

### 🔍 **Address Search & Geocoding**
- **World geocoding service** - Search any address globally
- **Auto-zoom to locations** - Instantly navigate to searched addresses
- **Reverse geocoding** - Auto-populate address when placing sales
- **Search suggestions** - Fast, accurate address finding

### 🎨 **Enhanced User Interface**
- **Prominent sign-in interface** - Clear authentication status
- **Loading overlays** - Visual feedback during operations
- **Better form organization** - Cleaner, more intuitive layout
- **Improved visibility** - Fixed dropdown readability issues
- **Mobile-responsive design** - Works on all devices

## 🚀 Quick Setup

### 1. **Download & Deploy**
- Extract the zip file to your local computer
- Upload all files to your GitHub repository  
- Enable GitHub Pages in repository settings (Settings → Pages → Source: Deploy from branch → main)

### 2. **Configure ArcGIS OAuth** 
- Go to [ArcGIS Developers Dashboard](https://developers.arcgis.com/)
- Edit your OAuth application settings
- Add redirect URL: `https://yourusername.github.io/yourrepo/callback.html`
- The app uses CLIENT_ID: `ic6BRtzVkEpNKVjS` (already configured)

### 3. **Verify Organization Settings**
The app is pre-configured for City of Portland (`cityofportland.maps.arcgis.com`). 
To change this, edit `config.js`:

```javascript
// Organization Restrictions
ALLOWED_ORGANIZATIONS: ["yourcity.maps.arcgis.com"],  // Change this
ORGANIZATION_NAME: "Your City Name",                  // Change this
```

### 4. **Test Authentication**
- Visit your GitHub Pages URL
- Click "Sign In with ArcGIS" 
- Should redirect to City of Portland login
- Only Portland employees will be granted access

## 📋 How It Works

### **For Users:**
1. **Sign In** → Use City of Portland ArcGIS credentials
2. **Search Address** → Find location using the search box
3. **Add Sale** → Click "New Sale", then click map location
4. **Set Details** → Fill address, dates, times, and items
5. **Multi-Day?** → Check box for different times on different days
6. **Save** → Description auto-generates and saves to ArcGIS

### **For Administrators:**
- All data stored in your ArcGIS Online feature service
- Complete audit trail of who added/edited what
- Organization-level access control
- Export capabilities for reporting

## 🛡️ Security Features

### **Organization Authentication**
```javascript
// Only these organizations can access
ALLOWED_ORGANIZATIONS: ["cityofportland.maps.arcgis.com"]

// Validates user organization on every sign-in
isAuthorizedOrganization(orgId, orgUrl) {
    return allowedOrgs.some(org => 
        orgUrl.toLowerCase().includes(org.toLowerCase())
    );
}
```

### **Enhanced Callback Security**
- State verification prevents CSRF attacks
- Organization validation on token exchange
- Automatic session cleanup on security failures
- Clear error messages for unauthorized users

### **Content Security Policy**
```html
<!-- Restricts resource loading for security -->
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    connect-src 'self' https://*.arcgis.com https://*.esri.com;
    script-src 'self' 'unsafe-inline' https://unpkg.com;
">
```

## 📐 Layer Requirements

Your ArcGIS Online feature service must have these fields:

| Field Name | Type | Description |
|------------|------|-------------|
| `Address` | Text | Street address of garage sale |
| `Description` | Text | Auto-generated from times + items |
| `Date_1` | Date | Start date/time |
| `EndDate` | Date | End date/time |

**Example Description Output:**
- Single: `"7:00 AM - 4:00 PM: Books, clothes, furniture"`
- Multi: `"Friday 7:00 AM - 2:00 PM & Saturday 8:00 AM - 4:00 PM: Books, clothes"`

## 🎨 User Interface Guide

### **Authentication States**
- 🔒 **Not Signed In**: Red prompt with "Sign In Required"
- ✅ **Signed In**: Green status with user name and organization
- ❌ **Unauthorized**: Clear message explaining organization restriction

### **Map Interactions**
- 🏷️ **Garage Sale Markers**: Bright circular icons, click to edit
- 📍 **New Sale Mode**: Green pin follows cursor, click to place
- ✏️ **Edit Mode**: Yellow marker shows selected sale location
- 🔍 **Search Results**: Blue marker shows geocoded addresses

### **Form Features**
- 📝 **Auto-Description**: Updates in real-time as you type
- 📅 **Date Pickers**: Standard browser date inputs
- ⏰ **Time Selectors**: Dropdowns for hours, minutes, AM/PM
- ✔️ **Multi-Day Toggle**: Checkbox reveals advanced day/time options

## 🔧 Customization

### **Change Map Style**
```javascript
// In app.js, replace OpenStreetMap with your preferred tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);
```

### **Modify Marker Appearance**
```javascript
// In app.js, customize the garage sale icon
const garageSaleIcon = L.divIcon({
    className: 'garage-sale-icon',
    html: '<div class="garage-sale-marker">🏠</div>',  // Change emoji
    iconSize: [30, 30]
});
```

### **Update Color Scheme**
```css
/* In styles.css, modify CSS variables */
:root {
    --accent: #your-color;     /* Primary accent color */
    --accent-2: #your-color-2; /* Secondary accent */
    --success: #your-success;  /* Success/auth color */
}
```

## 📱 Mobile Support

The app is fully responsive with:
- **Stacked layout** on narrow screens
- **Touch-friendly buttons** and form controls  
- **Optimized map interactions** for mobile devices
- **Collapsible authentication** section on small screens

## 🔍 Troubleshooting

### **Authentication Issues**
- ✅ Verify `CLIENT_ID` matches your ArcGIS app
- ✅ Check callback URL is exact: `https://yoursite.com/callback.html`
- ✅ Confirm user belongs to allowed organization
- ✅ Test with different browsers/incognito mode

### **Map Not Loading**
- ✅ Check browser console for JavaScript errors
- ✅ Verify internet connection (needs external tile service)
- ✅ Test with simpler HTML page first

### **Feature Layer Issues**  
- ✅ Confirm `LAYER_URL` is correct in `config.js`
- ✅ Verify layer is shared with your organization
- ✅ Check field names match `FIELDS` configuration
- ✅ Test layer URL directly in browser

### **Organization Access Denied**
```
"Access denied. Only City of Portland users are authorized."
```
- User's ArcGIS account is not in the allowed organization
- Update `ALLOWED_ORGANIZATIONS` in `config.js` if needed
- Contact ArcGIS administrator to verify user's organization

## 📊 Browser Compatibility

| Browser | Version | Status |
|---------|---------|---------|
| Chrome | 88+ | ✅ Fully supported |
| Firefox | 85+ | ✅ Fully supported |
| Safari | 14+ | ✅ Fully supported |
| Edge | 88+ | ✅ Fully supported |

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For technical support:
- 📧 Email: `justin.mcintyre@portlandtx.gov`
- 📋 Issues: [GitHub Issues](https://github.com/yourusername/yourrepo/issues)
- 📖 Docs: This README and inline code comments

---

**Built with ❤️ for the City of Portland using modern web standards and secure authentication.**

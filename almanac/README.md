# Almanac

A Vue.js web application for visualizing astronomical almanac.

## Features

- **Interactive Form**: Select year and location (latitude/longitude)
- **Geolocation Support**: Automatically detect user's current location
- **Hourglass Visualization**: Beautiful plot showing sunrise/sunset times throughout the year
  - Left curve: Sunset times
  - Right curve: Sunrise times
  - Horizontal bars: Night duration
  - Month labels on Y-axis
  - Hour labels on X-axis
- **Responsive Design**: Built with Quasar Framework
- **Modern Plotting**: Uses Plotly.js for interactive charts

## Prerequisites

- Node.js (v16 or higher)
- EphemAPI server running on `http://localhost:3000`

## Installation

```bash
cd almanac
npm install
```

## Running the Application

1. **Start the EphemAPI server** (in a separate terminal):
   ```bash
   cd ../../haskell/EphemAPI
   cabal run EphemAPI
   ```

2. **Start the Vue development server**:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

## Usage

1. **Year**: Enter the year you want to visualize (1800-2050)
2. **Latitude**: Enter latitude in decimal degrees (-90 to 90)
   - Click the location icon to auto-detect your current position
3. **Longitude**: Enter longitude in decimal degrees (-180 to 180)
4. Click **Generate Almanac** to create the visualization

## How the Visualization Works

The plot creates an "hourglass" shape showing how sunrise and sunset times change throughout the year:

- **X-axis**: Hours of the day (0-23)
- **Y-axis**: Days of the year (1-366), grouped by month
- **Blue curves**: Sunrise (right) and Sunset (left) times
- **Light blue bars**: Night duration (time between sunset and sunrise)
- **Month labels**: Displayed on the left side

The hourglass shape is created by:
- Shifting sunset times: `sunset - 12` (for evening times)
- Shifting sunrise times: `sunrise + 12` (for morning times)

This makes the widest part of the "hourglass" represent the summer (longest days) and the narrowest part represent winter (shortest days).

## Technologies Used

- **Vue 3**: Progressive JavaScript framework
- **Quasar**: Material Design component framework
- **Plotly.js**: Interactive plotting library
- **Axios**: HTTP client for API calls
- **Vite**: Next-generation frontend build tool

## API Integration

The application connects to the EphemAPI endpoint:
```
GET http://localhost:3000/api/sunrise-sunset?lat={lat}&lon={lon}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
```

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Notes

- Times are displayed in GMT/UTC
- The visualization is based on astronomical calculations from the Ephem library
- Works best on modern browsers with JavaScript enabled and geolocation support

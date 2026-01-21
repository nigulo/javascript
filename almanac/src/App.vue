<template>
  <div class="app-container">
    <div class="content-wrapper">
      <h1>Astronomical Almanac</h1>

      <form @submit.prevent="generateAlmanac">
      <!-- Input Form -->
      <div class="form-card">
        <div class="form-row">
          <div class="form-field">
            <label for="year">Year</label>
            <input
              id="year"
              v-model.number="year"
              type="number"
              min="1800"
              max="2200"
              required
            />
          </div>

          <div class="form-field">
            <label for="latitude">Latitude</label>
            <div class="input-with-button">
              <input
                id="latitude"
                v-model.number="latitude"
                type="number"
                step="0.0001"
                min="-90"
                max="90"
                required
              />
              <button
                @click="getCurrentLocation"
                :disabled="loadingLocation"
                class="icon-btn"
                title="Get current location"
              >
                📍
              </button>
            </div>
          </div>

          <div class="form-field">
            <label for="longitude">Longitude</label>
            <input
              id="longitude"
              v-model.number="longitude"
              type="number"
              step="0.0001"
              min="-180"
              max="180"
              required
            />
          </div>

          <div class="form-field">
            <label for="timezone">Timezone (UTC offset)</label>
            <input
              id="timezone"
              v-model.number="timezone"
              type="number"
              step="0.5"
              min="-12"
              max="14"
              required
            />
          </div>

          <div class="form-field">
            <button
              type="submit"
              :disabled="loading"
              class="generate-btn"
            >
              {{ loading ? 'Loading...' : 'Generate Almanac' }}
            </button>
          </div>
        </div>

        <div v-if="locationError" class="error-msg">
          {{ locationError }}
        </div>
      </div>
      </form>

      <!-- Plot Area -->
      <div v-if="plotData" class="plot-card">
        <div ref="plotContainer" class="plot-container"></div>
      </div>

      <!-- Error Display -->
      <div v-if="error" class="error-banner">
        ⚠️ {{ error }}
      </div>

      <!-- Loading Indicator -->
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>Fetching data for {{ year }}...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'
import Plotly from 'plotly.js-dist-min'

// Form data
const year = ref(new Date().getFullYear())
const latitude = ref(58.378)
const longitude = ref(26.729)
const timezone = ref(0)

// State
const loading = ref(false)
const loadingLocation = ref(false)
const locationError = ref('')
const error = ref('')
const plotData = ref(null)
const plotContainer = ref(null)

// Get current location
const getCurrentLocation = () => {
  if (!navigator.geolocation) {
    locationError.value = 'Geolocation is not supported by your browser'
    return
  }

  loadingLocation.value = true
  locationError.value = ''

  // Set timezone offset from browser
  const offsetMinutes = -new Date().getTimezoneOffset()
  timezone.value = offsetMinutes / 60

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitude.value = parseFloat(position.coords.latitude.toFixed(4))
      longitude.value = parseFloat(position.coords.longitude.toFixed(4))
      loadingLocation.value = false
    },
    (err) => {
      locationError.value = `Unable to retrieve location: ${err.message}`
      loadingLocation.value = false
    }
  )
}

// Generate almanac
const generateAlmanac = async () => {
  error.value = ''
  loading.value = true

  try {
    // Calculate date range for the entire year
    const startDate = `${year.value}-01-01`
    const endDate = `${year.value}-12-31`

    // Call EphemAPI
    const response = await axios.get('http://localhost:3000/api/sunrise-sunset', {
      params: {
        lat: latitude.value,
        lon: longitude.value,
        startDate: startDate,
        endDate: endDate
      }
    })

    plotData.value = response.data

    // Wait for DOM update and create plot
    await nextTick()
    createPlot(response.data)

  } catch (err) {
    error.value = `Failed to fetch data: ${err.message}`
    console.error('Error fetching almanac data:', err)
  } finally {
    loading.value = false
  }
}

// Create the hourglass plot
const createPlot = (data) => {
  if (!plotContainer.value) return

  // For each day, use current day's sunset and next day's sunrise
  // This represents the night between days
  const sunsetXValues = []
  const sunriseXValues = []
  const yValues = []

  // Print full data for debugging
  /*console.log('=== Sunrise/Sunset Data ===')
  console.log('Day | Date | Sunset UTC | Sunrise (next day) UTC | Sunset Local | Sunrise Local')
  data.slice(150, 170).forEach((d, idx) => {
    if (d.error) return
    const i = idx + 150
    const nextDay = data[i + 1]
    if (nextDay) {
      const sunsetUTC = timeToHours(d.sunset)
      const sunriseUTC = timeToHours(nextDay.sunrise)
      const sunsetLocal = ((sunsetUTC + timezone.value) % 24 + 24) % 24
      const sunriseLocal = ((sunriseUTC + timezone.value) % 24 + 24) % 24
      console.log(`${i+1} | ${d.date} | ${d.sunset} (${sunsetUTC.toFixed(2)}) | ${nextDay.sunrise} (${sunriseUTC.toFixed(2)}) | ${sunsetLocal.toFixed(2)} | ${sunriseLocal.toFixed(2)}`)
    }
  })*/

  const offset = Math.round(12 + longitude.value * 24/360)

  data.forEach((d, i) => {
    const nextDayData = data[i + 1]
    if (!nextDayData) return

    // Always pair day i's sunset with day i+1's sunrise
    let sunset = d.error ? null : clip(timeToHours(d.sunset) + offset)
    let sunrise = nextDayData.error ? null : clip(timeToHours(nextDayData.sunrise) + offset)
    sunrise = !sunset ? null : sunrise
    sunset = !sunrise ? null : sunset
    if (sunset > sunrise) {
        sunset = null
        sunrise = null
    }
    sunsetXValues.push(sunset)
    sunriseXValues.push(sunrise)
    yValues.push(i + 1)
  })

  const plotLeft = 0
  const plotRight = 24

  // Create traces for sunrise and sunset curves
  const sunsetTrace = {
    x: sunsetXValues,
    y: yValues,
    mode: 'lines',
    name: 'Sunset',
    line: {
      color: 'rgb(0, 0, 255)',
      width: 2
    },
    showlegend: false,
    hovertemplate: '%{customdata}<br>Sunset: %{text}<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(0, -1).map(d => d.error ? "" : shiftTime(d.sunset, getTimeZone()))
  }

  const sunriseTrace = {
    x: sunriseXValues,
    y: yValues,
    mode: 'lines',
    name: 'Sunrise',
    line: {
      color: 'rgb(0, 0, 255)',
      width: 2
    },
    showlegend: false,
    hovertemplate: '%{customdata}<br>Sunrise: %{text}<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(1).map(d => d.error ? "" : shiftTime(d.sunrise, getTimeZone()))
  }

  let polarNight = true
  let polarDay = false
  let polarDayEnd = false
  // Create night duration bars (horizontal lines between curves)
  const nightBars = []
  sunsetXValues.forEach((sunsetX, i) => {
    let sunriseX = sunriseXValues[i]
    if (!sunsetX || !sunriseX) {
        if (polarNight) {
            sunsetX = plotLeft
            sunriseX = plotRight
        } else if (polarDayEnd) {
            polarNight = true
            polarDayEnd = false
            sunsetX = plotLeft
            sunriseX = plotRight
        } else {
            polarDay = true
        }
    } else {
        polarNight = false
        if (polarDay) {
            polarDay = false
            polarDayEnd = true
        }
    }
    nightBars.push({
      x: [sunsetX, sunriseX],
      y: [yValues[i], yValues[i]],
      mode: 'lines',
      line: {
        color: 'rgba(200, 200, 255, 0.3)',
        width: 1
      },
      showlegend: false,
      hoverinfo: 'skip'
    })
  })

  const traces = [sunsetTrace, sunriseTrace, ...nightBars]

  // Create month labels and dividers
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const shapes = []
  const annotations = []

  // Y-axis custom tick labels
  const yTickVals = []
  const yTickText = []

  let dayCounter = 1  // Start from 1 to match y-values in data
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year.value, month + 1, 0).getDate()
    const monthStart = dayCounter
    const monthMiddle = dayCounter + daysInMonth / 2

    // Add month label to the left
    annotations.push({
      x: plotLeft - 0.5,
      y: monthMiddle,
      text: monthNames[month],
      showarrow: false,
      xanchor: 'right',
      xref: 'x',
      yref: 'y',
      font: {
        size: 11
      }
    })

    // Add month label on y-axis
    yTickVals.push(monthStart)
    yTickText.push(monthNames[month] + " " + 1)

    // Add day 10 and 20 markers within each month
    if (daysInMonth >= 10) {
      yTickVals.push(monthStart + 9)  // Day 10 is at index +9 from monthStart
      yTickText.push('10')
    }
    if (daysInMonth >= 20) {
      yTickVals.push(monthStart + 19)  // Day 20 is at index +19 from monthStart
      yTickText.push('20')
    }

    dayCounter += daysInMonth
  }

  // Layout configuration
  const layout = {
    title: `Sun Rise and Set Times for ${year.value} (Lat: ${latitude.value.toFixed(4)}°, Lon: ${longitude.value.toFixed(4)}°)`,
    xaxis: {
      title: 'Hours',
      range: [plotLeft, plotRight],
      tickmode: 'array',
      tickvals: range(plotLeft, plotRight),
      ticktext: range(plotLeft, plotRight).map(n => clip(n - offset + getTimeZone()).toString().padStart(2, '0')),
      zeroline: true,
      zerolinecolor: 'rgba(0, 0, 0, 0.3)',
      zerolinewidth: 2
    },
    yaxis: {
      title: 'Month',
      range: [dayCounter, 1],
      tickmode: 'array',
      tickvals: yTickVals,
      ticktext: yTickText,
      showticklabels: true,
    },
    shapes: shapes,
    annotations: annotations,
    hovermode: 'closest',
    showlegend: false,
    height: 800,
    margin: {
      l: 100,
      r: 50,
      t: 80,
      b: 80
    }
  }

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  }

  Plotly.newPlot(plotContainer.value, traces, layout, config)
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const clip = (n) => {
    return (n % 24 + 24) % 24
}

function shiftTime(timeStr, hours) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const totalSeconds = (h * 3600 + m * 60 + s) + hours * 3600;
    const normalized = ((totalSeconds % 86400) + 86400) % 86400; // Keep in 0–86399
    const hh = Math.floor(normalized / 3600);
    const mm = Math.floor((normalized % 3600) / 60);
    const ss = Math.floor(normalized % 60);
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

const getTimeZone = () => {
    return parseFloat(timezone.value) || 0
}

const formatDay = (day) => {
    const date = new Date(year.value, 0, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Helper function to convert time string to hours
const timeToHours = (timeStr) => {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number)
  return hours + minutes / 60 + seconds / 3600
}

// Get current location on mount
onMounted(() => {
  getCurrentLocation()
})
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #f5f5f5;
}

.app-container {
  min-height: 100vh;
  padding: 20px;
}

.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
}

h1 {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 24px;
  color: #1976d2;
}

.form-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
}

label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #1976d2;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button input {
  flex: 1;
}

.icon-btn {
  padding: 10px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generate-btn {
  width: 100%;
  padding: 10px 24px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 24px;
}

.generate-btn:hover:not(:disabled) {
  background: #1565c0;
}

.generate-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.plot-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.plot-container {
  width: 100%;
  height: 800px;
}

.error-msg {
  margin-top: 16px;
  padding: 12px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-size: 14px;
}

.error-banner {
  background: #f44336;
  color: white;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  font-size: 18px;
  font-weight: 500;
}

@media (max-width: 768px) {
  h1 {
    font-size: 1.5rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .plot-container {
    height: 600px;
  }
}
</style>

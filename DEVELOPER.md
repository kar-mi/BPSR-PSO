# Developer Guide - BPSR-PSO

This guide contains technical information for developers who want to build, modify, or contribute to BPSR-PSO.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Building from Source](#building-from-source)
- [Architecture Overview](#architecture-overview)
- [API Reference](#api-reference)
- [Contributing Guidelines](#contributing-guidelines)
- [Troubleshooting](#troubleshooting)

## Development Setup

### Prerequisites

You'll need to have the following software installed:

- **Node.js**: https://nodejs.org/ (v16 or higher recommended)
- **npm**: Comes bundled with Node.js
- **Npcap**: https://npcap.com/dist/npcap-1.84.exe
  - **Important**: Install in WinPcap API-compatible Mode
- **Git**: For version control
- **Visual Studio Build Tools** (Windows): Required for native module compilation

### Installation Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/kar-mi/BPSR-PSO.git
   cd BPSR-PSO
   ```

2. **Install Npcap:**
   - Download from https://npcap.com/dist/npcap-1.84.exe
   - Run installer with "Install Npcap in WinPcap API-compatible Mode" enabled

3. **Install Node.js dependencies:**

   ```bash
   npm install
   npm run rebuild
   ```

   The `rebuild` command recompiles native modules (like `cap`) for your Electron version.

## Project Structure

```
BPSR-PSO/
├── src/
│   ├── algo/              # Protocol buffer definitions
│   ├── client/            # Electron main process
│   │   ├── IpcListeners.js    # IPC event handlers
│   │   └── shortcuts.js       # Keyboard shortcut management
│   ├── models/            # Data models
│   │   ├── StatisticData.js   # Statistics tracking
│   │   └── UserData.js        # User data management
│   ├── public/            # Frontend files
│   │   ├── index.html         # Main overlay
│   │   ├── history.html       # Fight history viewer
│   │   ├── skills.html        # Skill breakdown
│   │   ├── settings.html      # Settings page
│   │   ├── script.js          # Main overlay logic
│   │   ├── history.js         # History page logic
│   │   ├── skills.js          # Skills page logic
│   │   ├── settings.js        # Settings page logic
│   │   ├── utils.js           # Shared utilities
│   │   └── style.css          # Global styles
│   ├── routes/            # API routes
│   │   └── api.js             # Express API endpoints
│   ├── services/          # Core services
│   │   ├── PacketInterceptor.js   # Network packet capture
│   │   ├── UserDataManager.js     # User data coordination
│   │   └── Logger.js              # Logging utility
│   ├── tables/            # Game data tables
│   │   ├── skill_names.json       # Skill name translations
│   │   └── skill_names_cn.json    # Chinese translations
│   ├── main.js            # Electron main entry point
│   ├── preload.js         # Preload script for renderer
│   └── server.js          # Express server setup
├── logs/                  # Fight logs storage
├── dist/                  # Build output directory
├── package.json           # Project dependencies
└── README.md              # User documentation
```

## Building from Source

### Development Mode

To run the application in development mode with hot-reloading:

```bash
npm run dev
```

This will:
1. Start the Express API server on port 3000
2. Launch the Electron application
3. Enable developer tools

### Production Build

To create a distributable build:

```bash
npm run build
```

This will:
1. Rebuild native modules for Electron compatibility
2. Package the application using electron-packager
3. Create a ZIP file in the `dist/` directory

**Output:** `dist/BPSR-PSO-win32-x64.zip`

### Build Requirements

- **7-Zip (optional)**: For better compression
  - If 7z is in PATH, the build script will use it
  - Otherwise, falls back to PowerShell's Compress-Archive

### Build Scripts

Available npm scripts:

```bash
npm start          # Start in production mode
npm run dev        # Start in development mode
npm run rebuild    # Rebuild native modules
npm run build      # Create production build
```

## Architecture Overview

### Technology Stack

- **Electron**: Desktop application framework
- **Express**: REST API server
- **Socket.IO**: Real-time communication
- **cap**: Network packet capture (native module)
- **protobufjs**: Protocol buffer parsing
- **Chart.js**: Data visualization

### Data Flow

```
Game Traffic (UDP Packets)
    ↓
PacketInterceptor (cap library)
    ↓
Protobuf Parsing (BlueProtobuf_pb.js)
    ↓
UserDataManager (data aggregation)
    ↓
Express API (REST endpoints)
    ↓
Frontend (Socket.IO for real-time updates)
```

### Key Components

#### 1. **PacketInterceptor** (`src/services/PacketInterceptor.js`)
- Captures UDP packets using libpcap
- Filters Blue Protocol traffic
- Decodes protobuf messages
- Emits parsed events

#### 2. **UserDataManager** (`src/services/UserDataManager.js`)
- Manages player statistics
- Tracks damage, healing, and skill usage
- Handles fight state (start/end)
- Persists fight logs to disk

#### 3. **API Server** (`src/routes/api.js`)
- Provides REST endpoints for data access
- Serves current and historical fight data
- Handles settings persistence

#### 4. **Electron Main Process** (`src/main.js`, `src/client/IpcListeners.js`)
- Window management
- IPC communication with renderer
- Application lifecycle

## API Reference

### REST Endpoints

#### Current Data

- `GET /api/users` - Get all current user statistics
- `GET /api/skill/:uid` - Get skill breakdown for user
- `POST /api/clear` - Clear current fight data

#### Fight History

- `GET /api/fight/list` - Get list of past fights
  - Query params: `startDate`, `endDate`
- `GET /api/fight/cumulative` - Get cumulative stats
  - Query params: `startDate`, `endDate`
- `GET /api/history/:timestamp/data` - Get fight data
- `GET /api/history/:timestamp/skill/:uid` - Get user skills
  - Query params: `enemy` (filter by enemy)
- `GET /api/history/:timestamp/timeseries/:uid` - Get time-series data
- `GET /api/history/:timestamp/download` - Download fight log

#### Settings

- `GET /api/network/adapters` - List network adapters
- `GET /api/network/selected` - Get selected adapter
- `POST /api/network/selected` - Set network adapter
- `GET /api/fight/timeout` - Get fight timeout
- `POST /api/fight/timeout` - Set fight timeout

### Socket.IO Events

#### Server → Client

- `message` - General status messages
- `userData` - Real-time user statistics update
- `reset` - Fight has been reset

#### Client → Server

- (Currently one-way communication)

## Contributing Guidelines

### Code Style

- Use ES6+ features (const/let, arrow functions, async/await)
- 4-space indentation
- Semicolons required
- Descriptive variable names

### Git Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Adding New Features

#### Adding a New Statistic

1. Update `StatisticData.js` to track the new data
2. Modify `UserData.js` to expose the statistic
3. Update API endpoints in `api.js` to return the data
4. Update frontend to display the new statistic

#### Adding a New API Endpoint

1. Define the route in `src/routes/api.js`
2. Add validation and error handling
3. Document the endpoint in this file
4. Add frontend calls in the appropriate `.js` file

### Testing

Currently, there are no automated tests. Manual testing checklist:

- [ ] Start application and verify overlay appears
- [ ] Enter combat and verify data appears
- [ ] Double-click player to view skill breakdown
- [ ] View fight history and verify past data loads
- [ ] Change settings and verify they persist
- [ ] Clear data and verify reset works
- [ ] Build and test packaged application

## Troubleshooting

### Common Issues

#### Native Module Build Failures

**Error:** `Cannot find module 'cap'`

**Solution:**
```bash
npm run rebuild
```

#### Npcap Not Found

**Error:** `Error opening device: The system cannot find the device specified`

**Solution:**
- Reinstall Npcap with "WinPcap API-compatible Mode" enabled
- Restart your computer after installation

#### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
- Another instance is running, close it first
- Change the port in `src/server.js`

#### Electron Packaging Issues

**Error:** Build fails with native module errors

**Solution:**
```bash
# Clean rebuild
rm -rf node_modules
npm install
npm run rebuild
npm run build
```

### Debug Mode

Enable verbose logging:

1. Open DevTools in Electron: `Ctrl+Shift+I`
2. Check console for errors
3. Server logs appear in terminal

### Log Files

Fight logs are stored in `./logs/[timestamp]/`:
- `fight.log` - Raw fight events
- `summary.json` - Fight summary
- `allUserData.json` - All user statistics
- `users/[uid].json` - Per-user data

## Related PRs and Resources

### Recent Enhancements

- https://github.com/Chase-Simmons/BPSR-PSO/pull/23/files
- https://github.com/Chase-Simmons/BPSR-PSO/pull/20/files
- https://github.com/Chase-Simmons/BPSR-PSO/pull/18/files

### Translation Data

Skill names and translations:
- https://github.com/Zaarrg/BlueProtocolStarResonanceDataAnalysis/tree/master/Data/ProcessedGameData/StarResonanceDps_Data

## License

See [LICENSE.txt](LICENSE.txt) for license information.

## Questions?

- Open an issue on GitHub
- Check existing issues for similar problems
- Review the code comments for implementation details

# Getting Started

## Requirements

Before running .mdTree, install:

- [Python 3.12 or later](https://www.python.org/downloads)
- [Node.js LTS](https://nodejs.org)

The start script handles everything else — Python virtual environment, Python packages, and npm dependencies — automatically on first run.

## Installation

Clone the repository and run the start script for your platform.

**Windows:**

```bat
git clone https://github.com/rick-suspends/md-tree.git
cd md-tree
start.bat
```

**Mac / Linux / WSL:**

```bash
git clone https://github.com/rick-suspends/md-tree.git
cd md-tree
./start.sh
```

## First run

On first run the script will:

1. Install npm packages for the frontend
2. Build the frontend
3. Create a Python virtual environment
4. Install Python dependencies
5. Start the server

This takes a minute or two. Subsequent runs skip the setup steps and start much faster.

## Opening the app

Once the server is running, open your browser and go to:

```
http://localhost:8002
```

The app opens to the Documentation project by default. After that, it remembers the last project you had open.

## Stopping the server

Press `Ctrl+C` in the terminal window where the start script is running.

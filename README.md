# SchoolRyde Backend Core

Backend service for the SchoolRyde application.

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and configure the following environment variables:
   ```env
   # Required Environment Variables
   DATABASE_URL=
   JWT_SECRET=
   # Add other required variables here
   ```

## Development

To run the application in development mode:
`npm run start:dev`

## Production

To run the application in production mode:
`npm run start:prod`

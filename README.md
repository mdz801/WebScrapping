# Web Scraping Application

Web application built with **Node.js**, **Express** and **Playwright** for browser automation and web data extraction.

## Tech Stack

- Node.js
- Express
- Playwright
- JavaScript

## Structure

```text
controllers/
routes/
services/
public/
app.js
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the application:

```bash
npm start
```

By default, the server runs on port `3000`.

## Health Check

```text
GET /healthz
```

## Architecture

The application separates HTTP routes, controllers and scraping services so browser automation logic remains independent from the web layer.

---

**Author:** Miguel Martínez

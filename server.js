import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bodyParser from "body-parser";
import cors from "cors";
import { Server } from "socket.io";
import admin from "firebase-admin";
import fs from "fs";

// Firebase Admin SDK Initialization
const serviceAccount = JSON.parse(fs.readFileSync("./firebase-service-account.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://currency-7e126.firebaseio.com",
});

const firestore = admin.firestore();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(join(__dirname, "public")));

// Function to initialize default rates in Firestore
async function initializeRates() {
  const ratesCollection = firestore.collection("rates");
  const snapshot = await ratesCollection.get();

  if (snapshot.empty) {
    const defaultRates = [
      { code: "USD", name: "US DOLLAR", symbol: "$", flag: "https://d3onttu1dfuhsx.cloudfront.net/us.svg", buy: "83.94", sell: "82.46" },
      { code: "EURO", name: "EURO", symbol: "€", flag: "https://upload.wikimedia.org/wikipedia/commons/b/b7/Flag_of_Europe.svg", buy: "91.08", sell: "90.66" },
      { code: "GBP", name: "POUND", symbol: "£", flag: "https://d3onttu1dfuhsx.cloudfront.net/gb.svg", buy: "106.6", sell: "105.5" },
    ];
    for (const rate of defaultRates) {
      await ratesCollection.doc(rate.code).set(rate);
    }
    console.log("Rates initialized in Firestore");
  }
}

initializeRates();

// Homepage Route
app.get("/", async (req, res) => {
  const ratesCollection = firestore.collection("rates");
  const snapshot = await ratesCollection.get();
  const rates = snapshot.docs.map((doc) => doc.data());

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Travelogy Forex</title>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Orbitron', sans-serif; background-color: #1b1b2f; color: #f1f1f1; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
        .container { background-color: #2a2a3e; padding: 30px; border-radius: 12px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.7); width: 90%; max-width: 1000px; text-align: center; }
        .header { margin-bottom: 20px; }
        .company-name { font-size: 36px; font-weight: bold; color: #ffd700; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #444; }
        th { background-color: #333; color: #fff; }
        .symbol, .buy, .sell { font-size: 30px; font-weight: bold; color: #00ff00; text-shadow: 0 0 4px #00ff00; }
        .logo{margin-bottom: -20px;}.rbi{font-size: 16px;margin-top: -20px;color: #00ff00;margin-bottom: -10px;}.notice{text-align: center; color:#fff; margin-bottom:-10px;}.date{text-align: center; font-weight: bold, margin-top:0px;}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo"><img src="https://d3n3x6vi4wflr3.cloudfront.net/travelogylogo.svg" width="500" height="100"></div>
        <div class="header"><h1 class="company-name">TRAVELOGY HOLIDAYS PVT LTD</h1></div>
        <div class="header"><h6 class="rbi">RBI Licence No. GUW-FFMC-0105-2023</h6></div>
        <div class="date" id="current-date" style="font-size: 18px; color: #ffd700;"></div>
        <table>
          <thead><tr><th>CURRENCY</th><th>CODE</th><th>SYMBOL</th><th>BUY</th><th>SELL</th></tr></thead>
          <tbody id="rates-body">
            ${rates
              .map(
                (rate) => `
                <tr>
                  <td><img src="${rate.flag}" alt="${rate.code}" style="width: 30px; height: 20px;"> ${rate.name}</td>
                  <td>${rate.code}</td>
                  <td class="symbol">${rate.symbol}</td>
                  <td class="buy">${rate.buy}</td>
                  <td class="sell">${rate.sell}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div class="notice"><h4>*Rates are subject to change without notice.</h4></div>
      </div>
      <script>
        document.getElementById("current-date").innerText = "Date: " + new Date().toLocaleDateString();
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// Admin Panel Route
app.get("/admin", async (req, res) => {
  const ratesCollection = firestore.collection("rates");
  const snapshot = await ratesCollection.get();
  const rates = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Panel</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #1b1b2f; color: #f1f1f1; margin: 0; padding: 20px; }
        h1 { color: #ffd700; text-align: center; }
        .form-section, .rates-section { margin: 20px auto; max-width: 800px; background-color: #2a2a3e; padding: 20px; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; border: 1px solid #444; text-align: left; }
        th { background-color: #333; color: white; }
        input, button { padding: 10px; border-radius: 5px; margin-bottom: 10px; }
        .delete-btn { background: red; color: white; }
        .edit-btn { background: orange; color: white; }
      </style>
    </head>
    <body>
      <h1>Admin Panel</h1>

      <!-- Add Currency Form -->
      <div class="form-section">
        <h2>Add/Edit Currency</h2>
        <form id="currency-form">
          <input type="hidden" id="edit-id">
          <label>Code:</label>
          <input type="text" id="code" required><br>
          <label>Name:</label>
          <input type="text" id="name" required><br>
          <label>Symbol:</label>
          <input type="text" id="symbol" required><br>
          <label>Flag:</label>
          <input type="text" id="flag" required><br>
          <label>Buy:</label>
          <input type="text" id="buy" required><br>
          <label>Sell:</label>
          <input type="text" id="sell" required><br>
          <button type="submit">Save</button>
        </form>
      </div>

      <!-- Existing Rates Table -->
      <div class="rates-section">
        <h2>Manage Currencies</h2>
        <table>
          <thead>
            <tr><th>Currency</th><th>Code</th><th>Buy</th><th>Sell</th><th>Actions</th></tr>
          </thead>
          <tbody id="rates-table">
            ${rates
              .map(
                (rate) => `
                <tr>
                  <td>${rate.name} (${rate.symbol})</td>
                  <td>${rate.code}</td>
                  <td>${rate.buy}</td>
                  <td>${rate.sell}</td>
                  <td>
                    <button class="edit-btn" data-id="${rate.id}" data-rate='${JSON.stringify(rate)}'>Edit</button>
                    <button class="delete-btn" data-id="${rate.id}">Delete</button>
                  </td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <script>
        // Add/Edit Currency
        document.getElementById("currency-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const id = document.getElementById("edit-id").value;
          const currency = {
            code: document.getElementById("code").value,
            name: document.getElementById("name").value,
            symbol: document.getElementById("symbol").value,
            flag: document.getElementById("flag").value,
            buy: document.getElementById("buy").value,
            sell: document.getElementById("sell").value,
          };
          if (id) {
            await fetch("/update-currency/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currency) });
          } else {
            await fetch("/add-currency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currency) });
          }
          alert("Currency saved successfully!");
          location.reload();
        });

        // Edit Currency
        document.querySelectorAll(".edit-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const rate = JSON.parse(btn.getAttribute("data-rate"));
            document.getElementById("edit-id").value = rate.id;
            document.getElementById("code").value = rate.code;
            document.getElementById("name").value = rate.name;
            document.getElementById("symbol").value = rate.symbol;
            document.getElementById("flag").value = rate.flag;
            document.getElementById("buy").value = rate.buy;
            document.getElementById("sell").value = rate.sell;
          });
        });

        // Delete Currency
        document.querySelectorAll(".delete-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            await fetch("/delete-currency/" + id, { method: "DELETE" });
            alert("Currency deleted successfully!");
            location.reload();
          });
        });
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// Add Currency API
app.post("/add-currency", async (req, res) => {
  const ratesCollection = firestore.collection("rates");
  const newRate = req.body;
  await ratesCollection.doc(newRate.code).set(newRate);
  res.send({ message: "Currency added successfully!" });
});

// Update Currency API
app.put("/update-currency/:id", async (req, res) => {
  const ratesCollection = firestore.collection("rates");
  const id = req.params.id;
  const updatedRate = req.body;
  await ratesCollection.doc(id).update(updatedRate);
  res.send({ message: "Currency updated successfully!" });
});

// Delete Currency API
app.delete("/delete-currency/:id", async (req, res) => {
  const ratesCollection = firestore.collection("rates");
  const id = req.params.id;
  await ratesCollection.doc(id).delete();
  res.send({ message: "Currency deleted successfully!" });
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

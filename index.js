const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const { connectDB, getDB } = require("./config/db");
const localStore = require("./localStore");

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: process.env.JSON_LIMIT || "12mb" }));
app.use(express.static(path.join(__dirname, "..", "client", "build")));

// --- Run DB Initialization immediately for both local and production serverless runs ---
connectDB().catch(err => console.error("Database connection initialization failed:", err.message));

// --- ADDED ROOT ROUTE FOR VERCEL ---
app.get("/", (req, res) => {
  res.send("ShopApp API Server is running successfully on Vercel!");
});

function normalizeProduct(body) {
  return {
    name: body.name?.trim(),
    price: Number(body.price),
    stock_quantity: Math.max(0, Math.floor(Number(body.stock_quantity ?? body.quantity ?? 0))),
    category: body.category?.trim() || null,
    image_url: body.image_url?.trim() || null,
    description: body.description?.trim() || null,
  };
}

function validateProduct(product) {
  if (!product.name) return "Product name is required.";
  if (!Number.isFinite(product.price) || product.price < 0) return "A valid price is required.";
  return "";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateSignup(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "A valid email is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return "";
}

function isSchemaError(error) {
  return /column|schema|cache/i.test(error?.message || "");
}

async function insertProduct(supabase, product) {
  let result = await supabase
    .from("products")
    .insert([product])
    .select();

  if (result.error && isSchemaError(result.error)) {
    result = await supabase
      .from("products")
      .insert([{ name: product.name, price: product.price }])
      .select();
  }

  return result;
}

async function updateProduct(supabase, id, product) {
  let result = await supabase
    .from("products")
    .update(product)
    .eq("id", id)
    .select();

  if (result.error && isSchemaError(result.error)) {
    result = await supabase
      .from("products")
      .update({ name: product.name, price: product.price })
      .eq("id", id)
      .select();
  }

  return result;
}

function normalizeOrder(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const paymentReceived = Boolean(body.paymentReceived);
  const delivered = Boolean(body.delivered);

  return {
    userEmail: body.userEmail?.trim() || null,
    customerName: body.customerName?.trim() || null,
    customerPhone: body.customerPhone?.trim() || null,
    items,
    subtotal: Number(body.subtotal || 0),
    shipping: Number(body.shipping || 0),
    discount: Number(body.discount || 0),
    total: Number(body.total || 0),
    couponCode: body.couponCode?.trim() || null,
    paymentMethod: body.paymentMethod?.trim() || null,
    paymentProvider: body.paymentProvider?.trim() || null,
    paymentReference: body.paymentReference?.trim() || null,
    paymentStatus: body.paymentStatus || "pending",
    paymentReceived,
    paymentRisk: body.paymentRisk || "normal",
    deliveryMethod: body.deliveryMethod?.trim() || null,
    deliveryEta: body.deliveryEta?.trim() || null,
    deliveryAddress: body.deliveryAddress?.trim() || null,
    delivered,
    approvalStatus: body.approvalStatus || "pending",
    orderStatus: delivered ? "delivered" : body.orderStatus || "pending",
    trackingNumber: body.trackingNumber?.trim() || null,
    adminNote: body.adminNote?.trim() || null,
    date: body.date || new Date().toISOString(),
  };
}

async function upsertProfileBasics(supabase, user, fullName) {
  const attempts = [
    { id: user.id, email: user.email, full_name: fullName, role: "user" },
    { id: user.id, email: user.email, role: "user" },
    { id: user.id, email: user.email },
    { id: user.id },
  ];

  for (const payload of attempts) {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload)
      .select('id') // Only request the ID back to prevent 406 format rejection errors
      .maybeSingle();
    if (!error) return data || payload;
    if (!isSchemaError(error)) throw error;
  }

  return null;
}

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is connected to Supabase." });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ShopApp API" });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const validationError = validateSignup(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const supabase = getDB();
    if (!supabase) {
      return res.status(503).json({ error: "Signup requires Supabase credentials on the server." });
    }

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password);
    const fullName = String(req.body.fullName || req.body.full_name || "").trim();
    const metadata = { full_name: fullName };

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) throw error;

    const profile = data.user
      ? await upsertProfileBasics(supabase, data.user, fullName)
      : null;

    res.status(201).json({
      message: "Account created.",
      user: data.user,
      profile,
    });
  } catch (err) {
    const message = err.message || "Signup failed.";
    const status = /already registered|already been registered|already exists/i.test(message) ? 409 : 500;
    console.error("Signup Error:", message);
    res.status(status).json({ error: message });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const supabase = getDB();
    if (!supabase) return res.json(localStore.listProducts());

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Fetch Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const supabase = getDB();
    const product = normalizeProduct(req.body);
    const validationError = validateProduct(product);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!supabase) {
      return res.status(201).json({ message: "Product saved locally.", result: localStore.addProduct(product), source: "local" });
    }

    const { data, error } = await insertProduct(supabase, product);

    if (error) throw error;
    if (!data?.[0]) {
      return res.status(500).json({ error: "Product was not returned after insert." });
    }
    res.status(201).json({ message: "Product saved to Supabase.", result: { ...product, ...data[0] } });
  } catch (err) {
    console.error("Insert Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const supabase = getDB();
    const product = normalizeProduct(req.body);
    const validationError = validateProduct(product);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!supabase) {
      const updated = localStore.updateProduct(req.params.id, product);
      if (!updated) return res.status(404).json({ error: "Product was not found." });
      return res.json({ message: "Product updated locally.", result: updated, source: "local" });
    }

    const { data, error } = await updateProduct(supabase, req.params.id, product);

    if (error) throw error;
    if (!data?.[0]) {
      return res.status(404).json({ error: "Product was not found or could not be updated." });
    }
    res.json({ message: "Product updated.", result: { ...product, ...data[0] } });
  } catch (err) {
    console.error("Update Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const supabase = getDB();
    if (!supabase) {
      if (!localStore.deleteProduct(req.params.id)) {
        return res.status(404).json({ error: "Product was not found." });
      }
      return res.json({ message: "Product deleted locally.", source: "local" });
    }

    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", req.params.id)
      .select("id");

    if (error) throw error;
    if (!data?.length) {
      return res.status(404).json({ error: "Product was not found or could not be deleted." });
    }
    res.json({ message: "Product deleted." });
  } catch (err) {
    console.error("Delete Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const supabase = getDB();
    if (!supabase) return res.json(localStore.listOrders());

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Fetch Orders Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const supabase = getDB();
    const order = normalizeOrder(req.body);
    if (!supabase) {
      return res.status(201).json({ message: "Order saved locally.", result: localStore.addOrder(order), source: "local" });
    }

    const { data, error } = await supabase
      .from("orders")
      .insert([order])
      .select();

    if (error) throw error;
    res.status(201).json({ message: "Order saved.", result: data?.[0] || order });
  } catch (err) {
    console.error("Insert Order Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  try {
    const supabase = getDB();
    const patch = normalizeOrder(req.body);
    if (!supabase) {
      const updated = localStore.updateOrder(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "Order was not found." });
      return res.json({ message: "Order updated locally.", result: updated, source: "local" });
    }

    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", req.params.id)
      .select();

    if (error) throw error;
    if (!data?.[0]) return res.status(404).json({ error: "Order was not found." });
    res.json({ message: "Order updated.", result: data[0] });
  } catch (err) {
    console.error("Update Order Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ONLY use listen if running a standard local Node server environment
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Backend running locally on http://localhost:${PORT}`);
  });
}

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"), (err) => {
    if (err) {
      res.status(404).send("API endpoint not found / Static frontend build missing.");
    }
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.type === "entity.too.large" ? 413 : err.status || 500;
  res.status(status).json({
    error: status === 413
      ? "The uploaded image/request is too large. Use a smaller image or Supabase Storage."
      : err.message || "Server error.",
  });
});

// --- CRITICAL VERCEL EXPORT ---
module.exports = app;
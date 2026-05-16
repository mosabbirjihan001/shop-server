const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { connectDB, getDB } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

function normalizeProduct(body) {
  return {
    name: body.name?.trim(),
    price: Number(body.price),
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
      .select()
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

    const { data, error } = await insertProduct(supabase, product);

    if (error) throw error;
    if (!data?.[0]) {
      return res.status(500).json({ error: "Product was not returned after insert." });
    }
    res.status(201).json({ message: "Product saved to Supabase.", result: data[0] });
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

    const { data, error } = await updateProduct(supabase, req.params.id, product);

    if (error) throw error;
    if (!data?.[0]) {
      return res.status(404).json({ error: "Product was not found or could not be updated." });
    }
    res.json({ message: "Product updated.", result: data[0] });
  } catch (err) {
    console.error("Update Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const supabase = getDB();
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

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log("Supabase connected.");
    });
  } catch (err) {
    console.error("Server failed to start", err.message);
    process.exit(1);
  }
})();

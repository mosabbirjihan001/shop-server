const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function connectDB() {
  if (!supabase) {
    console.warn("Supabase credentials are missing. API will keep running with local fallbacks where available.");
    return false;
  }

  try {
    const { error } = await supabase.from("products").select("id").limit(1);
    if (error) throw error;

    console.log("Supabase connected successfully.");
    return true;
  } catch (err) {
    console.warn("Supabase connection failed. API is still running.");
    console.warn(err.message);
    return false;
  }
}

const getDB = () => supabase;

module.exports = { connectDB, getDB };

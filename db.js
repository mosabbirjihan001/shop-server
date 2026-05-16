const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Check to prevent the "undefined" crash
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: SUPABASE_URL or SUPABASE_KEY is missing in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function connectDB() {
  try {
    // We test the connection by fetching one row from your table
    const { data, error } = await supabase.from('products').select('id').limit(1);
    
    if (error) throw error;
    
    console.log("Supabase (PostgreSQL) Connected Successfully ✅");
  } catch (err) {
    console.error("Supabase connection failed ❌");
    console.error(err.message);
    process.exit(1);
  }
}

const getDB = () => supabase;

module.exports = { connectDB, getDB };
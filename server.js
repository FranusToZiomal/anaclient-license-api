const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// =========================
// FUNCTIONS
// =========================

function addDays(days) {

  const date = new Date();

  date.setDate(
    date.getDate() + Number(days)
  );

  return date.toISOString();
}

function generateKey() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let out = "ANACLIENT-";

  for (let group = 0; group < 4; group++) {

    for (let i = 0; i < 4; i++) {

      out += chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
    }

    if (group !== 3) {
      out += "-";
    }
  }

  return out;
}

// =========================
// ROOT
// =========================

app.get("/", (req, res) => {

  res.json({
    status: "Anaclient License API online"
  });

});

// =========================
// GENERATE LICENSE
// =========================

app.post("/generate", async (req, res) => {

  try {

    const {
      days,
      admin_secret
    } = req.body;

    if (
      admin_secret !== ADMIN_SECRET
    ) {

      return res.status(403).json({
        success: false,
        message: "Wrong admin secret"
      });

    }

    const license_key =
      generateKey();

    const expires_at =
      addDays(days || 7);

    const { error } =
      await supabase
        .from("licenses")
        .insert({
          license_key,
          expires_at,
          active: true
        });

    if (error) {

      return res.status(500).json({
        success: false,
        message: error.message
      });

    }

    res.json({
      success: true,
      license_key,
      expires_at
    });

  } catch (e) {

    res.status(500).json({
      success: false,
      message: e.message
    });

  }

});

// =========================
// TEST GENERATE
// =========================

app.get("/testgenerate", async (req, res) => {

  try {

    const license_key =
      generateKey();

    const expires_at =
      addDays(7);

    const { error } =
      await supabase
        .from("licenses")
        .insert({
          license_key,
          expires_at,
          active: true
        });

    if (error) {

      return res.json({
        success: false,
        error: error.message
      });

    }

    res.json({
      success: true,
      license_key,
      expires_at
    });

  } catch (e) {

    res.json({
      success: false,
      error: e.message
    });

  }

});

// =========================
// ACTIVATE LICENSE
// =========================

app.post("/activate", async (req, res) => {

  try {

    const {
      license_key,
      hwid
    } = req.body;

    const {
      data,
      error
    } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", license_key)
      .single();

    if (error || !data) {

      return res.json({
        success: false,
        message: "Invalid license"
      });

    }

    if (!data.active) {

      return res.json({
        success: false,
        message: "License disabled"
      });

    }

    if (
      new Date(data.expires_at)
      < new Date()
    ) {

      return res.json({
        success: false,
        message: "License expired"
      });

    }

    if (
      data.hwid &&
      data.hwid !== hwid
    ) {

      return res.json({
        success: false,
        message: "Wrong PC"
      });

    }

    if (!data.hwid) {

      await supabase
        .from("licenses")
        .update({
          hwid
        })
        .eq(
          "license_key",
          license_key
        );

    }

    res.json({
      success: true,
      message: "License activated",
      expires_at: data.expires_at
    });

  } catch (e) {

    res.json({
      success: false,
      message: e.message
    });

  }

});

// =========================
// CHECK LICENSE
// =========================

app.post("/check", async (req, res) => {

  try {

    const {
      license_key,
      hwid
    } = req.body;

    const {
      data,
      error
    } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", license_key)
      .single();

    if (error || !data) {

      return res.json({
        success: false,
        message: "Invalid license"
      });

    }

    if (!data.active) {

      return res.json({
        success: false,
        message: "License disabled"
      });

    }

    if (
      new Date(data.expires_at)
      < new Date()
    ) {

      return res.json({
        success: false,
        message: "License expired"
      });

    }

    if (
      data.hwid !== hwid
    ) {

      return res.json({
        success: false,
        message: "Wrong PC"
      });

    }

    res.json({
      success: true,
      message: "License valid",
      expires_at: data.expires_at
    });

  } catch (e) {

    res.json({
      success: false,
      message: e.message
    });

  }

});

// =========================
// START SERVER
// =========================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    "API running on port " + PORT
  );

});

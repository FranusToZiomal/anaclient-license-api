require("dotenv").config();

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

const LIFETIME_DATE = "9999-12-31T23:59:59.000Z";

function requireAdmin(req, res) {
  if (req.body.admin_secret !== ADMIN_SECRET) {
    res.status(403).json({
      success: false,
      message: "Wrong admin secret"
    });

    return false;
  }

  return true;
}

function isLifetime(expires_at) {
  return String(expires_at).startsWith("9999");
}

function addDays(days) {
  const parsed = Number(days);

  if (isNaN(parsed)) {
    throw new Error("Invalid days value");
  }

  // 0 = lifetime
  if (parsed === 0) {
    return LIFETIME_DATE;
  }

  const date = new Date();

  date.setDate(date.getDate() + parsed);

  return date.toISOString();
}

function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let out = "ANACLIENT-";

  for (let group = 0; group < 4; group++) {
    for (let i = 0; i < 4; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }

    if (group !== 3) {
      out += "-";
    }
  }

  return out;
}

async function autoDeleteExpiredLicense(license) {
  try {
    if (!license) return false;

    // lifetime zostaje
    if (isLifetime(license.expires_at)) {
      return false;
    }

    const expired =
      new Date(license.expires_at) < new Date();

    if (expired) {
      await supabase
        .from("licenses")
        .delete()
        .eq("license_key", license.license_key);

      return true;
    }

    return false;
  } catch (e) {
    console.log("Auto delete error:", e.message);
    return false;
  }
}

app.get("/", (req, res) => {
  res.json({
    status: "Anaclient License API online"
  });
});

app.post("/generate", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const license_key = generateKey();

    const days = req.body.days ?? 7;

    const expires_at = addDays(days);

    const { error } = await supabase
      .from("licenses")
      .insert({
        license_key,
        expires_at,
        hwid: null
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
      expires_at,
      lifetime: isLifetime(expires_at)
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message
    });
  }
});

app.post("/activate", async (req, res) => {
  try {
    const { license_key, hwid } = req.body;

    if (!license_key || !hwid) {
      return res.json({
        success: false,
        message: "Missing license_key or hwid"
      });
    }

    const { data, error } = await supabase
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

    const deleted =
      await autoDeleteExpiredLicense(data);

    if (deleted) {
      return res.json({
        success: false,
        message: "License expired"
      });
    }

    if (data.hwid && data.hwid !== hwid) {
      return res.json({
        success: false,
        message: "Wrong PC"
      });
    }

    if (!data.hwid) {
      const { error: updateError } = await supabase
        .from("licenses")
        .update({
          hwid
        })
        .eq("license_key", license_key);

      if (updateError) {
        return res.json({
          success: false,
          message: updateError.message
        });
      }

      data.hwid = hwid;
    }

    res.json({
      success: true,
      message: "License activated",
      expires_at: data.expires_at,
      lifetime: isLifetime(data.expires_at)
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/check", async (req, res) => {
  try {
    const { license_key, hwid } = req.body;

    if (!license_key || !hwid) {
      return res.json({
        success: false,
        message: "Missing license_key or hwid"
      });
    }

    const { data, error } = await supabase
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

    const deleted =
      await autoDeleteExpiredLicense(data);

    if (deleted) {
      return res.json({
        success: false,
        message: "License expired"
      });
    }

    if (data.hwid !== hwid) {
      return res.json({
        success: false,
        message: "Wrong PC"
      });
    }

    res.json({
      success: true,
      message: "License valid",
      expires_at: data.expires_at,
      lifetime: isLifetime(data.expires_at)
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/list", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      return res.json({
        success: false,
        message: error.message
      });
    }

    for (const license of data) {
      await autoDeleteExpiredLicense(license);
    }

    const { data: refreshedData } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    res.json({
      success: true,
      licenses: refreshedData
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/extend", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key, days } = req.body;

    const parsedDays = Number(days);

    if (isNaN(parsedDays)) {
      return res.json({
        success: false,
        message: "Invalid days value"
      });
    }

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", license_key)
      .single();

    if (error || !data) {
      return res.json({
        success: false,
        message: "License not found"
      });
    }

    // 0 = lifetime
    if (parsedDays === 0) {
      const { error: updateError } = await supabase
        .from("licenses")
        .update({
          expires_at: LIFETIME_DATE
        })
        .eq("license_key", license_key);

      if (updateError) {
        return res.json({
          success: false,
          message: updateError.message
        });
      }

      return res.json({
        success: true,
        message: "License set to lifetime",
        expires_at: LIFETIME_DATE
      });
    }

    // nie przedłużaj lifetime
    if (isLifetime(data.expires_at)) {
      return res.json({
        success: false,
        message: "License already lifetime"
      });
    }

    const baseDate =
      new Date(data.expires_at) > new Date()
        ? new Date(data.expires_at)
        : new Date();

    baseDate.setDate(
      baseDate.getDate() + parsedDays
    );

    const { error: updateError } = await supabase
      .from("licenses")
      .update({
        expires_at: baseDate.toISOString()
      })
      .eq("license_key", license_key);

    if (updateError) {
      return res.json({
        success: false,
        message: updateError.message
      });
    }

    res.json({
      success: true,
      message: "License extended",
      expires_at: baseDate.toISOString()
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/reduce", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key, days } = req.body;

    const parsedDays = Number(days);

    if (isNaN(parsedDays)) {
      return res.json({
        success: false,
        message: "Invalid days value"
      });
    }

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", license_key)
      .single();

    if (error || !data) {
      return res.json({
        success: false,
        message: "License not found"
      });
    }

    if (isLifetime(data.expires_at)) {
      return res.json({
        success: false,
        message: "Cannot reduce lifetime license"
      });
    }

    const date = new Date(data.expires_at);

    date.setDate(
      date.getDate() - parsedDays
    );

    const expired =
      date < new Date();

    if (expired) {
      await supabase
        .from("licenses")
        .delete()
        .eq("license_key", license_key);

      return res.json({
        success: true,
        message: "License expired and deleted"
      });
    }

    const { error: updateError } = await supabase
      .from("licenses")
      .update({
        expires_at: date.toISOString()
      })
      .eq("license_key", license_key);

    if (updateError) {
      return res.json({
        success: false,
        message: updateError.message
      });
    }

    res.json({
      success: true,
      message: "License time reduced",
      expires_at: date.toISOString()
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/lifetime", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key } = req.body;

    const { error } = await supabase
      .from("licenses")
      .update({
        expires_at: LIFETIME_DATE
      })
      .eq("license_key", license_key);

    if (error) {
      return res.json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      message: "License set to lifetime"
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/reset-hwid", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key } = req.body;

    const { error } = await supabase
      .from("licenses")
      .update({
        hwid: null
      })
      .eq("license_key", license_key);

    if (error) {
      return res.json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      message: "HWID reset"
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/delete", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key } = req.body;

    const { error } = await supabase
      .from("licenses")
      .delete()
      .eq("license_key", license_key);

    if (error) {
      return res.json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      message: "License deleted permanently"
    });
  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running on port " + PORT);
});

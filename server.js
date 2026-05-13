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

function addDays(days) {
  if (Number(days) === 0) {
    return "9999-12-31T23:59:59.000Z";
  }

  const date = new Date();
  date.setDate(date.getDate() + Number(days));

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

app.get("/", (req, res) => {
  res.json({
    status: "Anaclient License API online"
  });
});

app.post("/generate", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const license_key = generateKey();
    const expires_at = addDays(req.body.days || 7);

    const { error } = await supabase
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

app.post("/activate", async (req, res) => {
  try {
    const { license_key, hwid } = req.body;

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

    if (new Date(data.expires_at) < new Date()) {

      if (data.active) {
        await supabase
          .from("licenses")
          .update({
            active: false
          })
          .eq("license_key", license_key);
      }

      return res.json({
        success: false,
        message: "License expired"
      });
    }

    if (!data.active) {
      return res.json({
        success: false,
        message: "License disabled"
      });
    }

    if (data.hwid && data.hwid !== hwid) {
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
        .eq("license_key", license_key);
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

app.post("/check", async (req, res) => {
  try {
    const { license_key, hwid } = req.body;

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

    if (new Date(data.expires_at) < new Date()) {

      if (data.active) {
        await supabase
          .from("licenses")
          .update({
            active: false
          })
          .eq("license_key", license_key);
      }

      return res.json({
        success: false,
        message: "License expired"
      });
    }

    if (!data.active) {
      return res.json({
        success: false,
        message: "License disabled"
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
      expires_at: data.expires_at
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

    res.json({
      success: true,
      licenses: data
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

    const baseDate =
      new Date(data.expires_at) > new Date()
        ? new Date(data.expires_at)
        : new Date();

    baseDate.setDate(baseDate.getDate() + Number(days));

    const { error: updateError } = await supabase
      .from("licenses")
      .update({
        expires_at: baseDate.toISOString(),
        active: true
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

    const date = new Date(data.expires_at);

    date.setDate(date.getDate() - Number(days));

    const expired = date < new Date();

    const { error: updateError } = await supabase
      .from("licenses")
      .update({
        expires_at: date.toISOString(),
        active: !expired
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
        expires_at: "9999-12-31T23:59:59.000Z",
        active: true
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

app.post("/admin/enable", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key } = req.body;

    const { error } = await supabase
      .from("licenses")
      .update({
        active: true
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
      message: "License enabled"
    });

  } catch (e) {
    res.json({
      success: false,
      message: e.message
    });
  }
});

app.post("/admin/disable", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { license_key } = req.body;

    const { error } = await supabase
      .from("licenses")
      .update({
        active: false
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
      message: "License disabled"
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
      message: "License deleted"
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

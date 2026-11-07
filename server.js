import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const lpSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    commitment: {
      type: Number,
      required: true,
    },
    dateOfJoin: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Lp = mongoose.model("Lp", lpSchema);
const closeSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      unique: true,
    },
    merged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Close = mongoose.model("Close", closeSchema);

app.get("/", (req, res) => {
  res.send("Business Backend is running");
});

app.get("/api/closes", async (req, res) => {
  try {
    const lps = await Lp.find();

    const dates = [...new Set(lps.map((lp) => lp.dateOfJoin))].sort();

    for (let i = 0; i < dates.length; i++) {
      await Close.findOneAndUpdate(
        { date: dates[i] },
        {
          $setOnInsert: {
            date: dates[i],
            merged: i === 0,
          },
        },
        { upsert: true, new: true }
      );
    }

    let closes = await Close.find().sort({ date: 1 });

    // First close is always merged
    if (closes.length > 0 && !closes[0].merged) {
      closes[0].merged = true;
      await closes[0].save();
    }

    res.json({
      data: {
        mergedDates: closes
          .filter((close) => close.merged)
          .map((close) => close.date),
        closes,
      },
    });
  } catch (error) {
    console.error("Error fetching closes:", error);
    res.status(500).json({
      message: "Failed to fetch closes",
      error: error.message,
    });
  }
});

app.post("/api/closes/merge", async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        message: "Close date is required",
      });
    }

    const closes = await Close.find().sort({ date: 1 });

    const nextClose = closes.find((close, index) => index > 0 && !close.merged);

    if (!nextClose || nextClose.date !== date) {
      return res.status(400).json({
        message: "Only the next sequential close can be merged",
      });
    }

    nextClose.merged = true;

    await nextClose.save();

    const updatedCloses = await Close.find().sort({ date: 1 });

    res.json({
      message: "Close merged successfully",

      data: {
        mergedDates: updatedCloses
          .filter((close) => close.merged)
          .map((close) => close.date),

        closes: updatedCloses,
      },
    });
  } catch (error) {
    console.error("Error merging close:", error);

    res.status(500).json({
      message: "Failed to merge close",
      error: error.message,
    });
  }
});

app.post("/api/lps", async (req, res) => {
  try {
    const name = req.body.name ?? req.body.userName;
    const { commitment, dateOfJoin } = req.body;

    if (!name || !commitment || !dateOfJoin) {
      return res.status(400).json({
        message: "name (or userName), commitment and dateOfJoin are required",
      });
    }

    const lpObject = {
      name,
      commitment: Number(commitment),
      dateOfJoin,
    };

    const savedLp = await Lp.create(lpObject);

    res.status(201).json({
      message: "LP saved successfully",
      data: savedLp,
    });
  } catch (error) {
    console.error("Error saving LP:", error);
    res.status(500).json({
      message: "Failed to save LP",
      error: error.message,
    });
  }
});

app.get("/api/lps", async (req, res) => {
  try {
    const lps = await Lp.find().sort({ createdAt: -1 });
    res.status(200).json(lps);
  } catch (error) {
    console.error("Error fetching LPs:", error);
    res.status(500).json({
      message: "Failed to fetch LPs",
      error: error.message,
    });
  }
});

if (!process.env.MONGODB_URL) {
  console.error("MONGODB_URL is missing in your environment variables.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });

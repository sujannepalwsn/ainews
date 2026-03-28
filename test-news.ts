import fetch from "node-fetch";

async function test() {
  try {
    const response = await fetch("http://localhost:3000/api/collect-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

test();

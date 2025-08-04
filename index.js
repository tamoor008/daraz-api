const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");  // Import crypto for signing
const { log } = require("console");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json()); // To parse JSON request body

const APP_KEY = "503646";
const APP_SECRET = "GRM2aosy8VXIV0xzclq6loMKeaRAv996";




function calculateOrderBalances(apiResponse) {
  const orderMap = {};

  apiResponse?.forEach(item => {
    const orderNo = item.order_no;
    if (!orderNo || !item.amount) return;

    // Clean the amount: remove commas and parse to float
    const cleanedAmount = parseFloat(item.amount.toString().replace(/,/g, ''));

    if (isNaN(cleanedAmount)) return; // skip invalid numbers

    if (!orderMap[orderNo]) {
      orderMap[orderNo] = {
        order_no: orderNo,
        total_amount: 0
      };
    }

    orderMap[orderNo].total_amount += cleanedAmount;
  });

  return Object.values(orderMap);
}


// Function to generate the sign parameter
function generateSign(url, params, appSecret) {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  // Start with URL path
  let stringToSign = url;

  // Append key-value pairs in order without separators
  for (const key of sortedKeys) {
    stringToSign += key + params[key];
  }

  // Generate HMAC-SHA256 hash, then uppercase hex digest
  return crypto
    .createHmac("sha256", appSecret)
    .update(stringToSign)
    .digest("hex")
    .toUpperCase();
}

app.post("/get-daraz-token", async (req, res) => {
  const timestamp = Date.now().toString();
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  const urlPath = "/auth/token/create";
  const params = {
    app_key: APP_KEY,
    code,
    sign_method: "sha256",
    timestamp,
  };

  const sign = generateSign(urlPath, params, APP_SECRET);

  try {
    // Step 1: Get access token
    const tokenResponse = await axios.post(
      "https://api.daraz.pk/rest/auth/token/create",
      new URLSearchParams({ ...params, sign }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const tokenData = tokenResponse.data;
    const { access_token } = tokenData;


    if (!access_token) {
      return res.status(500).json({ error: "Access token not received from Daraz" });
    }

    // Step 2: Get seller/store info
    const sellerTimestamp = Date.now().toString();
    const sellerParams = {
      app_key: APP_KEY,
      access_token,
      timestamp: sellerTimestamp,
      sign_method: "sha256",
    };

    const sellerSign = generateSign("/seller/get", sellerParams, APP_SECRET);

    const sellerResponse = await axios.get("https://api.daraz.pk/rest/seller/get", {
      params: {
        ...sellerParams,
        sign: sellerSign,
      },
    });

    const sellerData = sellerResponse.data;

    // Return both token and seller details
    return res.status(200).json({
      token: tokenData,
      seller: sellerData,
      seller_id: sellerData.data.short_code
    });

  } catch (error) {
    console.error("Error from Daraz API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch token or seller data",
      details: error.response?.data || error.message
    });
  }
});


app.get("/get-daraz-orders", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, created_after, status } = req.query;

  console.log(access_token);
  

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const urlPath = "/orders/get";
  const params = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    status,
    created_after, // only if provided
  };

  const sign = generateSign(urlPath, params, APP_SECRET);

  try {
    const response = await axios.get(
      "https://api.daraz.pk/rest/orders/get",
      {
        params: {
          ...params,
          sign,
        },
      }
    );

    return res.status(200).json(response.data); // send full response back to client

  } catch (error) {
    console.error("Error fetching Daraz orders:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch orders",
      details: error.response?.data || error.message
    });
  }
});

app.get("/get-order-items", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, order_ids } = req.query; // optionally include order_id

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }


  const urlPath = "/orders/items/get";

  // These must be sorted alphabetically inside your generateSign function
  const params = {
    access_token,
    app_key: APP_KEY,
    sign_method: "sha256",
    timestamp,
    order_ids,
  };

  const sign = generateSign(urlPath, params, APP_SECRET);

  try {
    const response = await axios.get("https://api.daraz.pk/rest/orders/items/get", {
      params: {
        ...params,
        sign,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching Daraz order items:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch order items",
      details: error.response?.data || error.message,
    });
  }
});



// app.get("/get-daraz-order-details", async (req, res) => {
//   const timestamp = Date.now().toString();
//   const { access_token, created_after, status } = req.query;

//   if (!access_token) {
//     return res.status(400).json({ error: "Missing access_token" });
//   }

//   // STEP 1: Get list of orders
//   const ordersUrlPath = "/orders/get";
//   const orderParams = {
//     app_key: APP_KEY,
//     access_token,
//     sign_method: "sha256",
//     timestamp,
//     status,
//     created_after,
//   };
//   const orderSign = generateSign(ordersUrlPath, orderParams, APP_SECRET);

//   try {
//     const ordersResponse = await axios.get("https://api.daraz.pk/rest/orders/get", {
//       params: {
//         ...orderParams,
//         sign: orderSign,
//       },
//     });

//     const orders = ordersResponse.data.data?.orders || [];
//     if (orders.length === 0) {
//       return res.status(200).json({
//         countTotal: 0,
//         orderItems: [],
//       });
//     }

//     const order_ids_array = orders.map(order => order.order_id);

//     const order_ids = `[${order_ids_array.join(',')},]`;
//     // STEP 2: Get order items
//     const itemsUrlPath = "/orders/items/get";
//     const itemsTimestamp = Date.now().toString();
//     const itemParams = {
//       access_token,
//       app_key: APP_KEY,
//       sign_method: "sha256",
//       timestamp: itemsTimestamp,
//       order_ids,
//     };
//     const itemSign = generateSign(itemsUrlPath, itemParams, APP_SECRET);
//     const itemsResponse = await axios.get("https://api.daraz.pk/rest/orders/items/get", {
//       params: {
//         ...itemParams,
//         sign: itemSign,
//       },
//     });


//     const orderItems = itemsResponse.data;

//     return res.status(200).json({
//       countTotal: orders.length,
//       message: 'SOME ISSUE',
//       orderNumbers: order_ids,
//       orderItems: orderItems,
//     });

//   } catch (error) {
//     console.error("Error in merged Daraz order details API:", error.response?.data || error.message);
//     return res.status(500).json({
//       error: "Failed to fetch order details",
//       details: error.response?.data || error.message
//     });
//   }
// });


// Simple test API to check server status via browser


app.get("/get-daraz-order-details", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, update_after, created_after, status } = req.query;

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const ordersUrlPath = "/orders/get";
  const orderParams = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    status,
  };

  // ✅ Add `trans_type` only if it exists
  if (created_after) {
    orderParams.created_after = created_after;
  }
  // ✅ Add `trans_type` only if it exists
  if (update_after) {
    orderParams.update_after = update_after;
  }


  const orderSign = generateSign(ordersUrlPath, orderParams, APP_SECRET);

  try {
    // STEP 1: Get list of orders
    const ordersResponse = await axios.get("https://api.daraz.pk/rest/orders/get", {
      params: {
        ...orderParams,
        sign: orderSign,
      },
    });

    const orders = ordersResponse.data.data?.orders || [];
    if (orders.length === 0) {
      return res.status(200).json({
        countTotal: 0,
        orderItems: [],
      });
    }

    const order_ids_array = orders.map(order => order.order_id);

    // STEP 2: Break into chunks of 50 and fetch items
    const chunkSize = 50;
    const orderItemsCombined = [];

    for (let i = 0; i < order_ids_array.length; i += chunkSize) {
      const chunk = order_ids_array.slice(i, i + chunkSize);
      const order_ids = `[${chunk.join(',')}]`;

      const itemsUrlPath = "/orders/items/get";
      const itemsTimestamp = Date.now().toString();
      const itemParams = {
        access_token,
        app_key: APP_KEY,
        sign_method: "sha256",
        timestamp: itemsTimestamp,
        order_ids,
      };
      const itemSign = generateSign(itemsUrlPath, itemParams, APP_SECRET);

      const itemsResponse = await axios.get("https://api.daraz.pk/rest/orders/items/get", {
        params: {
          ...itemParams,
          sign: itemSign,
        },
      });

      const items = itemsResponse.data?.data || [];
      orderItemsCombined.push(...items);
    }

    return res.status(200).json({
      countTotal: orders.length,
      orderItems: orderItemsCombined,
    });

  } catch (error) {
    console.error("Error in merged Daraz order details API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch order details",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/get-daraz-income-details", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, storeName, created_after } = req.query;

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const ordersUrlPath = "/finance/payout/status/get";
  const orderParams = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    created_after,
  };
  const orderSign = generateSign(ordersUrlPath, orderParams, APP_SECRET);

  try {
    // STEP 1: Get list of orders
    const financeRespone = await axios.get("https://api.daraz.pk/rest/finance/payout/status/get", {
      params: {
        ...orderParams,
        sign: orderSign,
      },
    });



    const unpaidStatements = financeRespone.data.data
      .filter(item => item.paid === "0")
      .map(item => ({
        ...item,
        storeName: storeName, // ← add your variable here
      }));


    return res.status(200).json({
      financeRespone: unpaidStatements,
    });

  } catch (error) {
    console.error("Error in merged Daraz order details API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch order details",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/get-daraz-query-income-details", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, trade_order_id, end_time, start_time, trans_type, limit, trade_order_line_id } = req.query;


  console.log(access_token);

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const ordersUrlPath = "/finance/transaction/details/get";
  const orderParams = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    start_time,
    end_time,
  };

  // ✅ Add `trans_type` only if it exists
  if (trans_type) {
    orderParams.trans_type = trans_type;
  }

  if (trade_order_id) {
    orderParams.trade_order_id = trade_order_id;
  }
  if (limit) {
    orderParams.limit = limit;
  }
  if (trade_order_line_id) {
    orderParams.trade_order_line_id = trade_order_line_id;
  }
  const orderSign = generateSign(ordersUrlPath, orderParams, APP_SECRET);

  try {
    // STEP 1: Get list of orders
    const financeRespone = await axios.get("https://api.daraz.pk/rest/finance/transaction/details/get", {
      params: {
        ...orderParams,
        sign: orderSign,
      },
    });


    const transactions = financeRespone?.data?.data || [];
    const total = calculateOrderBalances(transactions);

    console.log('📊 Total transactions found:', transactions.length);
    console.log('💰 Total order balances:', total.length);

    return res.status(200).json({
      message: 'Transaction details retrieved successfully',
      data: {
        total: total,
        transactions: transactions,
        summary: {
          totalTransactions: transactions.length,
          totalOrders: total.length,
          totalAmount: total.reduce((sum, order) => sum + order.total_amount, 0)
        }
      },
      error: null,
      statusCode: 200,
    });

  } catch (error) {
    console.error("Error in Transaction details API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch Transaction details",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/get-daraz-delivered-order-details", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, update_after, update_before, created_after, status } = req.query;




  // console.log(access_token);
  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const ordersUrlPath = "/orders/get";
  const orderParams = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    status,
  };

  if (created_after) {
    orderParams.created_after = created_after;
  }

  if (update_after) {
    orderParams.update_after = update_after;
  }

  if (update_before) {
    orderParams.update_before = update_before;
  }


  const orderSign = generateSign(ordersUrlPath, orderParams, APP_SECRET);

  try {
    // STEP 1: Get list of orders
    const ordersResponse = await axios.get("https://api.daraz.pk/rest/orders/get", {
      params: {
        ...orderParams,
        sign: orderSign,
      },
    });

    const orders = ordersResponse.data.data?.orders || [];
    if (orders.length === 0) {
      return res.status(200).json({
        countTotal: 0,
        orderItems: [],
      });
    }

    const order_ids_array = orders.map(order => order.order_id);

    // STEP 2: Break into chunks of 50 and fetch items
    const chunkSize = 50;
    const orderItemsCombined = [];

    for (let i = 0; i < order_ids_array.length; i += chunkSize) {
      const chunk = order_ids_array.slice(i, i + chunkSize);
      const order_ids = `[${chunk.join(',')}]`;

      const itemsUrlPath = "/orders/items/get";
      const itemsTimestamp = Date.now().toString();
      const itemParams = {
        access_token,
        app_key: APP_KEY,
        sign_method: "sha256",
        timestamp: itemsTimestamp,
        order_ids,
      };
      const itemSign = generateSign(itemsUrlPath, itemParams, APP_SECRET);

      const itemsResponse = await axios.get("https://api.daraz.pk/rest/orders/items/get", {
        params: {
          ...itemParams,
          sign: itemSign,
        },
      });

      const items = itemsResponse.data?.data || [];
      // console.log(items[0].order_items[0], 'iTEMS');

      // ✅ Inject access_token into each order_items array
      const itemsWithTokenInside = items.map(order => ({
        ...order,
        order_items: order.order_items.map(item => ({
          ...item,
          access_token,
        })),
      }));

      orderItemsCombined.push(...itemsWithTokenInside);

    }
    const filteredOrderItems = orderItemsCombined
      .map(order => ({
        ...order,
        order_items: order.order_items.filter(item => item.status === status)
      }))
      .filter(order => order.order_items.length > 0); // remove empty orders


    return res.status(200).json({
      countTotal: orders.length,
      orderItems: filteredOrderItems,
    });

  } catch (error) {
    console.error("Error in merged Daraz order details API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch order details",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/get-daraz-order-logistics", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, order_id, package_id_list, locale } = req.query;

  if (!access_token || !order_id || !package_id_list || !locale) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const urlPath = "/order/logistic/get";
  const params = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    order_id,
    package_id_list,
    locale,
  };

  const sign = generateSign(urlPath, params, APP_SECRET);

  try {
    const response = await axios.get("https://api.daraz.pk/rest/order/logistic/get", {
      params: {
        ...params,
        sign,
      },
    });

    console.log("Logistics Data:", response.data);

    return res.status(200).json(response.data);

  } catch (error) {
    console.error("Error in Daraz order logistics API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch logistics info",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/make-order-rts", async (req, res) => {
  const timestamp = Date.now().toString();
  const readyToShipReq = req.body || {};
  const { access_token } = req.query;

  console.log("🔍 DEBUG: Full request body:", req.body);
  console.log("🔍 DEBUG: readyToShipReq:", readyToShipReq);
  console.log("🔍 DEBUG: readyToShipReq.packages:", readyToShipReq.packages);
  console.log("🔍 DEBUG: Is packages array?", Array.isArray(readyToShipReq.packages));

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  if (!readyToShipReq || !Array.isArray(readyToShipReq.packages)) {
    console.log("❌ Validation failed:");
    console.log("  - readyToShipReq exists:", !!readyToShipReq);
    console.log("  - packages exists:", !!readyToShipReq.packages);
    console.log("  - packages is array:", Array.isArray(readyToShipReq.packages));
    return res.status(400).json({ error: "Missing or invalid packages" });
  }

  const apiPath = "/order/package/rts";
  const params = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
  };

  // For POST requests with body, include the body content in signature
  const paramsWithBody = {
    ...params,
    readyToShipReq: JSON.stringify(readyToShipReq)
  };

  const sign = generateSign(apiPath, paramsWithBody, APP_SECRET);

  try {
    const response = await axios.post(
      "https://api.daraz.pk/rest/order/package/rts",
      new URLSearchParams({ readyToShipReq: JSON.stringify(readyToShipReq) }),
      {
        params: { ...params, sign },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("RTS API Success:", response.data);
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("RTS API Error:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to mark package(s) as RTS",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/make-order-pack-and-rts", async (req, res) => {
  const timestamp = Date.now().toString();
  const packReq = req.body || {};
  const { access_token } = req.query;

  console.log("🚀 Pack and RTS API Request Started");
  console.log("📝 Request Body:", JSON.stringify(packReq, null, 2));
  console.log("🔑 Access Token:", access_token);

  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  if (!packReq || !Array.isArray(packReq.pack_order_list)) {
    return res.status(400).json({ error: "Missing or invalid pack_order_list" });
  }

  try {
    // STEP 1: Pack the orders
    console.log("📦 Step 1: Packing orders...");
    const packApiPath = "/order/fulfill/pack";
    const packParams = {
      app_key: APP_KEY,
      access_token,
      sign_method: "sha256",
      timestamp,
    };

    const packParamsWithBody = {
      ...packParams,
      packReq: JSON.stringify(packReq)
    };

    const packSign = generateSign(packApiPath, packParamsWithBody, APP_SECRET);

    const packResponse = await axios.post(
      "https://api.daraz.pk/rest/order/fulfill/pack",
      new URLSearchParams({ packReq: JSON.stringify(packReq) }),
      {
        params: { ...packParams, sign: packSign },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("✅ Pack API Success:", packResponse.data);

    // STEP 2: Extract package IDs from pack response and mark as RTS
    console.log("🚚 Step 2: Marking packages as RTS...");
    
    // Extract package IDs from the pack response
    const packageIds = [];
    if (packResponse.data && packResponse.data.result && packResponse.data.result.data) {
      const packData = packResponse.data.result.data;
      
      // Check for pack_order_list structure
      if (packData.pack_order_list && Array.isArray(packData.pack_order_list)) {
        packData.pack_order_list.forEach(order => {
          if (order.order_item_list && Array.isArray(order.order_item_list)) {
            order.order_item_list.forEach(item => {
              if (item.package_id) {
                packageIds.push(item.package_id);
              }
            });
          }
        });
      }
      
      // Also check for direct packages structure
      if (packData.packages && Array.isArray(packData.packages)) {
        packData.packages.forEach(pkg => {
          if (pkg.package_id) {
            packageIds.push(pkg.package_id);
          }
        });
      }
      
      // Also check for direct package_id in response
      if (packData.package_id) {
        packageIds.push(packData.package_id);
      }
    }

    console.log("📦 Extracted Package IDs:", packageIds);

    if (packageIds.length === 0) {
      console.log("⚠️ No package IDs found in pack response, returning pack result only");
      return res.status(200).json({
        message: "Orders packed successfully, but no package IDs found for RTS",
        packResult: packResponse.data,
        rtsResult: null
      });
    }

    // Create RTS request
    const readyToShipReq = {
      packages: packageIds.map(packageId => ({
        package_id: packageId
      }))
    };

    console.log("📋 RTS Request:", JSON.stringify(readyToShipReq, null, 2));

    // STEP 3: Mark packages as RTS
    const rtsTimestamp = Date.now().toString();
    const rtsApiPath = "/order/package/rts";
    const rtsParams = {
      app_key: APP_KEY,
      access_token,
      sign_method: "sha256",
      timestamp: rtsTimestamp,
    };

    const rtsParamsWithBody = {
      ...rtsParams,
      readyToShipReq: JSON.stringify(readyToShipReq)
    };

    const rtsSign = generateSign(rtsApiPath, rtsParamsWithBody, APP_SECRET);

    const rtsResponse = await axios.post(
      "https://api.daraz.pk/rest/order/package/rts",
      new URLSearchParams({ readyToShipReq: JSON.stringify(readyToShipReq) }),
      {
        params: { ...rtsParams, sign: rtsSign },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("✅ RTS API Success:", rtsResponse.data);

    // Return combined result
    return res.status(200).json({
      message: "Orders packed and marked as RTS successfully",
      packResult: packResponse.data,
      rtsResult: rtsResponse.data
    });

  } catch (error) {
    console.error("❌ Pack and RTS API Error:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to pack orders and mark as RTS",
      details: error.response?.data || error.message,
    });
  }
});


app.get("/get-patients", async (req, res) => {
  const timestamp = Date.now().toString();
  const { access_token, order_id, package_id_list, locale } = req.query;

  if (!access_token || !order_id || !package_id_list || !locale) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const urlPath = "/order/logistic/get";
  const params = {
    app_key: APP_KEY,
    access_token,
    sign_method: "sha256",
    timestamp,
    order_id,
    package_id_list,
    locale,
  };

  const sign = generateSign(urlPath, params, APP_SECRET);

  try {
    const response = await axios.get("https://api.daraz.pk/rest/order/logistic/get", {
      params: {
        ...params,
        sign,
      },
    });

    console.log("Logistics Data:", response.data);

    return res.status(200).json(response.data);

  } catch (error) {
    console.error("Error in Daraz order logistics API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to fetch logistics info",
      details: error.response?.data || error.message,
    });
  }
});
const BASE_URL = 'https://das-admin-backend.moonsys.co/api/v1'; // Replace with your actual base URL

const hardcodedPatient = {
  _id: '686d3cb0d2523965310b09be',
  name: 'Tamoor Malik',
  email: 'Tamoor@yopmail.com',
  phoneNumber: '+922222222221',
  cardNumber: '4242424242424242',
  cardCVC: '333',
  cardExpiryDate: '2027-06-22T00:00:00.000Z',
  nameOnCard: 'sam',
  createdBy: {
    _id: '685c27a087bd428b29fc773a',
    name: 'AI agent',
  },
  updatedBy: {
    _id: '685c27a087bd428b29fc773a',
    name: 'AI agent',
  },
  createdAt: '2025-07-08T15:43:44.374Z',
  updatedAt: '2025-07-08T15:43:44.374Z',
  __v: 0,
};





app.get('/api/patient', async (req, res) => {
  console.log('req.query',req.query);
  console.log('req.body',req.body);
  
  const { phoneNumber } = req.query;
  
  console.log('📞 Original phoneNumber:', phoneNumber, 'Type:', typeof phoneNumber);

  // Use default phone number if not provided
  let searchPhoneNumber = phoneNumber || '+92322222222';
  console.log('🔧 Before formatting:', searchPhoneNumber, 'Type:', typeof searchPhoneNumber);
  
  // Add plus sign if not present
  if (searchPhoneNumber && !searchPhoneNumber.startsWith('+')) {
    searchPhoneNumber = '+' + searchPhoneNumber;
    console.log('➕ Added plus sign');
  }
  
  console.log('🔍 Final phone number:', searchPhoneNumber);

      try {
      const response = await axios.get(`https://das-admin-backend.moonsys.co/api/v1/patients/search`, {
        params: { phoneNumber: searchPhoneNumber },
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODVjMjdhMDg3YmQ0MjhiMjlmYzc3M2EiLCJlbWFpbCI6ImFnZW50QGVtYWlsLmNvbSIsImlhdCI6MTc1MTk5NzU5MCwiZXhwIjoxNzgzNTMzNTkwfQ.tUjieOnJzQYuEnbFBQX-mOxT67oCVFIXPF93M48AJ_Q`, // <-- Replace with your actual token
          Accept: 'application/json',
        },
      });

    // Forward the external API response directly
    return res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      // Forward error response from external API
      return res.status(error.response.status).json(error.response.data);
    }

    // Internal error
    return res.status(500).json({
      message: 'Something went wrong while fetching patient data',
      data: null,
      error: error.message,
      statusCode: 500,
    });
  }
});


app.post('/api/appointment', async (req, res) => {
  const appointmentData = req.body;

  console.log('📥 Received Appointment Data:', appointmentData);

  try {
    // Forward the data to the real appointment API
    const response = await axios.post(
      'https://das-admin-backend.moonsys.co/api/v1/appointments/add',
      appointmentData,
      {
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODVjMjdhMDg3YmQ0MjhiMjlmYzc3M2EiLCJlbWFpbCI6ImFnZW50QGVtYWlsLmNvbSIsImlhdCI6MTc1MTk5NzU5MCwiZXhwIjoxNzgzNTMzNTkwfQ.tUjieOnJzQYuEnbFBQX-mOxT67oCVFIXPF93M48AJ_Q`, // <-- Replace with your actual token
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Appointment created successfully:', response.data);

    return res.status(response.status).json({
      message: 'Appointment created successfully',
      data: response.data,
      statusCode: response.status,
    });

  } catch (error) {
    console.error('❌ Failed to create appointment:', error.response.data.message);

    if (error.response) {
      // Forward external API error response
      return res.status(error.response.status).json({
        message: 'There is some error in appointment Creation',
        data: response.data,
        statusCode: response.status,
            });
    }

    // General internal server error
    return res.status(500).json({
      message: 'Unexpected error while creating appointment',
      error: error.message,
      statusCode: 500,
    });
  }
});

app.post('/api/patient/create', async (req, res) => {
  const incomingData = req.body;

  // Add default phone number if missing
  const patientData = {
    ...incomingData,
    phoneNumber: incomingData.phoneNumber || "+922222222222",
    cardNumber: "4242424242424242",
    cardCVC: "333",
    cardExpiryDate: "07/2029",
    nameOnCard: "sam",
  };

  console.log('📥 Received Patient Data:', patientData);

  try {
    const response = await axios.post(
      'https://das-admin-backend.moonsys.co/api/v1/patients/add',
      patientData,
      {
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODVjMjdhMDg3YmQ0MjhiMjlmYzc3M2EiLCJlbWFpbCI6ImFnZW50QGVtYWlsLmNvbSIsImlhdCI6MTc1MTk5NzU5MCwiZXhwIjoxNzgzNTMzNTkwfQ.tUjieOnJzQYuEnbFBQX-mOxT67oCVFIXPF93M48AJ_Q`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Patient created successfully:', response.data);

    return res.status(response.status).json({
      message: 'Patient created successfully',
      data: response.data,
      statusCode: response.status,
    });

  } catch (error) {
    // console.error('❌ Failed to create patient:', error);

    const errorMessage = error.response?.data?.message || 'There is some server error at the moment, we are really sorry. Please try again later.';

    console.log('////////');
    console.log(errorMessage,'error MEssage');
    return res.status(200).json({
      success: false,
      error: true,
      message: errorMessage,
    });
  }
});

app.get('/api/slots', async (req, res) => {
  const { date } = req.query;
  console.log('Requested date',date);

  if (!date) {
    return res.status(400).json({
      message: 'Date is required',
      data: null,
      error: 'Missing date parameter',
      statusCode: 400,
    });
  }

  const parsedDate = new Date(date);
  const dayOfWeek = parsedDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Define working hours
  let startHour = 9;
  let endHour = 18;

  if (dayOfWeek === 0) {
    // Sunday
    return res.status(200).json({
      message: 'Clinic is closed on Sunday',
      data: {
        date,
        availableSlots: [],
      },
      error: null,
      statusCode: 200,
    });
  } else if (dayOfWeek === 6) {
    // Saturday
    endHour = 13;
  }

  try {
    // Fetch all booked appointments for the given date
    const response = await axios.get(`https://das-admin-backend.moonsys.co/api/v1/appointments`, {
      params: { appointmentDate: date },
      headers: {
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODVjMjdhMDg3YmQ0MjhiMjlmYzc3M2EiLCJlbWFpbCI6ImFnZW50QGVtYWlsLmNvbSIsImlhdCI6MTc1MTk5NzU5MCwiZXhwIjoxNzgzNTMzNTkwfQ.tUjieOnJzQYuEnbFBQX-mOxT67oCVFIXPF93M48AJ_Q`, // <-- Replace with your actual token
        Accept: 'application/json',
      },
    });

    const appointments = response.data?.data || [];

    const bookedSlots = appointments.map((appt) => {
      const startTime = new Date(appt.appointmentStartTime);
      const hours = String(startTime.getHours()).padStart(2, '0');
      const minutes = String(startTime.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    });

    // Generate all available slots for that day
    const allSlots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      allSlots.push(`${String(hour).padStart(2, '0')}:00`);
    }

    // Exclude booked slots
    const availableSlots = allSlots.filter((slot) => !bookedSlots.includes(slot));

    return res.status(200).json({
      message: 'Available slots retrieved successfully',
      data: {
        date,
        availableSlots,
      },
      error: null,
      statusCode: 200,
    });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Failed to fetch appointment slots from source',
        data: null,
        error: error.response.data,
        statusCode: error.response.status,
      });
    }

    return res.status(500).json({
      message: 'Something went wrong while fetching appointment slots',
      data: null,
      error: error.message,
      statusCode: 500,
    });
  }
});









app.get("/get-practitioners", async (req, res) => {
  console.log("🏥 Getting practitioners...");

  try {
    // Return hardcoded practitioner data
    const practitioners = [
      {
        "id": "685d2ada8385f0131d591f67",
        "name": "Malik Humza",
        "email": "1@email.com",
        "role": "practitioner",
        "phoneNumber": "+921111111111",
        "createdAt": "2025-06-26T11:11:22.184Z",
        "updatedAt": "2025-06-26T11:11:22.184Z"
      },
      {
        "id": "6876397d04420f9830b4a8c9",
        "name": "Haleema MoonSys",
        "email": "haleema@email.com",
        "role": "practitioner",
        "phoneNumber": "03014358102",
        "createdAt": "2025-07-15T11:20:29.936Z",
        "updatedAt": "2025-07-21T11:45:47.504Z"
      },
      {
        "id": "6888de0c5e9d132a9f2a3516",
        "name": "Tamoor Malik",
        "email": "tamoormalik088@gmail.com",
        "role": "practitioner",
        "phoneNumber": "03215799205",
        "createdAt": "2025-07-29T14:43:24.050Z",
        "updatedAt": "2025-07-29T14:43:24.050Z"
      }
    ];

    console.log(`✅ Found ${practitioners.length} practitioners`);

    return res.status(200).json({
      message: 'Practitioners retrieved successfully',
      data: {
        totalPractitioners: practitioners.length,
        practitioners: practitioners
      },
      error: null,
      statusCode: 200,
    });

  } catch (error) {
    console.error('❌ Error fetching practitioners:', error.message);
    
    return res.status(500).json({
      message: 'Something went wrong while fetching practitioners',
      data: null,
      error: error.message,
      statusCode: 500,
    });
  }
});

app.get("/test", (req, res) => {
  res.send("API is working fine and sound!");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

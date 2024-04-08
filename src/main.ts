import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import PocketBase from "pocketbase/cjs";
import config from "./config.json";
import { Collections, Message, PushToken, User } from "./types";
import EventSource from "eventsource";
import fs from "fs";
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const logError = (...err: string[]) => {
  fs.appendFileSync("error.log", `[${new Date().toISOString()}]: ${err.join(" ")}\n`);
  console.error(...err);
};

if (!fs.existsSync("error.log")) {
  fs.writeFileSync("error.log", "");
}

global.EventSource = EventSource as any;

let tickets: ExpoPushTicket[] = [];

const expo = new Expo({
  ...config.expo,
});

const pb = new PocketBase(config.pocketbase.endpoint);

(async () => {
  await pb.admins.authWithPassword(config.pocketbase.email, config.pocketbase.password);

  await pb.collection(Collections.Messages).subscribe<Message>("*", async ({ action, record }) => {
    if (action === "create") {
      const sentFrom = await pb.collection(Collections.Users).getOne<User>(record.from);

      const usersInGroup = await pb
        .collection(Collections.Users)
        .getFullList<User>({ filter: `joinedGroups.id ?= "${record.group}"` });

      const filter = usersInGroup
        .filter((user) => user.id !== record.from)
        .map((user) => {
          return `user.id="${user.id}"`;
        })
        .join(" || ");

      const tokens = await pb.collection(Collections.PushTokens).getFullList<PushToken>({ filter });

      const messages: ExpoPushMessage[] = tokens.map((token) => {
        return {
          to: token.pushToken,
          data: record,
          title: `New message from ${sentFrom.name}`,
          body: record.text,
          priority: "high",
          sound: "default",
          badge: 1,
        };
      });

      console.log(messages);
      // const chunks = expo.chunkPushNotifications(messages);

      // for (let chunk of chunks) {
      //   let ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      //   tickets.push(...ticketChunk);
      // }
    }
  });
})();

setInterval(async () => {
  let receiptIds = [];
  for (let ticket of tickets) {
    if (ticket.status === "ok") {
      receiptIds.push(ticket.id);
    } else {
      logError(ticket.message);
    }
  }

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  for (let chunk of receiptIdChunks) {
    try {
      let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      console.log(receipts);

      for (let receiptId in receipts) {
        let receipt = receipts[receiptId];
        if (receipt.status === "ok") {
          continue;
        } else {
          if (receipt.details && receipt.details.error) {
            logError(receipt.message, receipt.details.error);
            // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
            switch (receipt.details.error) {
            }
          } else {
            logError(receipt.message);
          }
        }
      }
    } catch (err) {
      logError(err);
    }
  }
}, 900000); //900k ms = 15 minutes

const app = express();

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.post("/massNotification", async (req, res) => {
  interface Body {
    request: {
      userIds: string[] | ["*"];
      message: string;
    };
    user: {
      token: string;
      id: string;
    };
  }

  const body: Body = req.body;

  if (body.request && body.request.userIds && body.request.message && body.user && body.user.token && body.user.id) {
    //Ensure credentials are valid
    try {
      await axios.get(`${config.pocketbase.endpoint}/api/admins/${body.user.id}`, {
        headers: {
          Authorization: body.user.token,
        },
      });
    } catch {
      return res.status(401).send({ status: "InvalidAuthorization" });
    }

    // Fetch all tokens
    const filter = body.request.userIds.includes("*")
      ? ""
      : body.request.userIds
          .map((userId: string) => {
            return `user.id="${userId}"`;
          })
          .join(" && ");

    const tokens = await pb.collection(Collections.PushTokens).getFullList<PushToken>({ filter });

    const messages: ExpoPushMessage[] = tokens.map((token) => {
      return {
        to: token.pushToken,
        title: "System Message",
        body: body.request.message,
        priority: "high",
        sound: "default",
      };
    });

    console.log(messages);

    const chunks = expo.chunkPushNotifications(messages);

    for (let chunk of chunks) {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      tickets.push(...ticketChunk);
    }

    res.send({ status: "Success" });
  } else {
    res.status(400).send({ status: "InvalidBody" });
  }
});

app.listen(3001);

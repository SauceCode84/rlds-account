import * as amqp from "amqplib";
import { Collection, Cursor, Db, MongoClient } from "mongodb";

import { EventEnvelope } from "../common/event-envelope";
import { Publisher, Responder } from "../common";

class EventStore {

  constructor(private collection: Collection) {
  }

  async save(eventEnvelope: EventEnvelope): Promise<void> {
    await this.collection.insert(eventEnvelope);
  }

  loadByAggregateId(aggregateId: string): Promise<EventEnvelope[]> {
    return this.collection
      .find({ aggregateId: aggregateId })
      .sort({ timestamp: 1 })
      .toArray();
  }

  loadForAggregateType(aggregateType: string): Promise<EventEnvelope[]> {
    return this.collection
      .find({ aggregateType: aggregateType })
      .toArray();
  }

  loadEventCusor(): Cursor<EventEnvelope> {
    return this.collection.find({});
  }

}

async function startEventStore(): Promise<EventStore> {  
  let db: Db = await MongoClient.connect("mongodb://localhost/rlds");
  let eventsCollection: Collection = db.collection("events");
  
  await eventsCollection.createIndex({ aggregateId: 1 });
  await eventsCollection.createIndex({ aggregateName: 1 });

  return new EventStore(eventsCollection);
}

async function start() {
  try {
    const eventStore = await startEventStore();
    const eventStoreResponser = new Responder({
      name: "Event Store",
      queueName: "eventStore"
    });
    const eventStreamPublisher = new Publisher({
      name: "Event Stream",
      exchangeName: "eventStream"
    });

    async function processRequest(event: EventEnvelope): Promise<void> {
      console.log("processRequest event...", event);

      await eventStore.save(event);
      await eventStreamPublisher.publish(event);

      return Promise.resolve();
    }

    eventStoreResponser.on("", (request) => processRequest(request.data));
    
  } catch (err) {
    console.error(err);
  }
}

start();
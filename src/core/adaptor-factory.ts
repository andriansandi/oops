import type { InstanceRecord } from "../core/config.ts";
import { D1Adaptor } from "../adaptors/d1.ts";
import { BaseAdaptor } from "../core/adaptor.ts";

export function buildAdaptor(instance: InstanceRecord): BaseAdaptor {
  switch (instance.type) {
    case "d1":
      return new D1Adaptor(
        {
          id: instance.id,
          name: instance.name,
          type: instance.type,
          createdAt: instance.createdAt,
        },
        instance.credentials,
      );
    default:
      throw new Error(`Unknown adaptor type: ${(instance as InstanceRecord).type}`);
  }
}

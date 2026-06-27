import type { InstanceRecord } from "./instance.ts";
import { D1Adaptor } from "./adaptors/d1.ts";
import { NeonAdaptor } from "./adaptors/neon.ts";
import { BaseAdaptor } from "./adaptor.ts";

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
    case "neon":
      return new NeonAdaptor(
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

// EventBus — global signal hub, ported from the Godot autoload design.
// Any system emits, any system listens. Neither needs to know the other exists.
window.TV = window.TV || {};

TV.EventBus = {
  _listeners: {},

  on(signal, fn) {
    (this._listeners[signal] = this._listeners[signal] || []).push(fn);
  },

  emit(signal, ...args) {
    const list = this._listeners[signal];
    if (!list) return;
    for (const fn of list) fn(...args);
  },
};

// Signals used across systems (mirrors autoload/event_bus.gd):
//   resource_flow_started   (routeId)
//   resource_delivered      (routeId)
//   structure_section_restored (stage)
//   area_unlocked           (areaId)
//   station_powered         (stationId)
//   item_crafted            (itemId, count)
//   show_notification       (message)

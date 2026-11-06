use super::*;
use serde_json::{Value, json};
use std::time::Duration;

fn event(revision: u64) -> Value {
    json!({"type":"experiment.updated","experiment":{"experiment_id":"e1","revision":revision}})
}

#[tokio::test]
async fn owner_queue_overflow_keeps_latest_snapshot_and_monotone_sequence() {
    let hub = EventHub::new(EventLimits::default()).unwrap();
    let mut owner = hub.subscribe("owner", "session").unwrap();
    let mut other = hub.subscribe("other", "other-session").unwrap();
    let hello = owner.hello();
    assert_eq!(hello["type"], "hello");
    assert_eq!(hello["service"], "cirnet-api");
    assert_eq!(hello["sequence"], 0);
    assert_eq!(hello["capabilities"]["replay_commands"], false);
    assert_ne!(hello["stream_id"], other.hello()["stream_id"]);

    for revision in 0..130 {
        hub.publish("owner", event(revision));
    }
    assert_eq!(hub.metrics().scheduled_drains, 1);
    assert!(hub.metrics().ingress_events <= 127);
    let resync: Value = serde_json::from_str(owner.recv().await.unwrap().text()).unwrap();
    assert_eq!(resync["type"], "resync.required");
    assert_eq!(resync["reason"], "QUEUE_OVERFLOW");
    assert_eq!(resync["dropped_events"], 128);
    let mut sequence = resync["sequence"].as_u64().unwrap();
    for revision in 127..130 {
        let delivery = owner.recv().await.unwrap();
        let value: Value = serde_json::from_str(delivery.text()).unwrap();
        assert_eq!(value["experiment"]["revision"], revision);
        assert_eq!(value["aggregate_revision"], revision);
        assert_eq!(value["aggregate_id"], "e1");
        assert_eq!(value["stream_id"], hello["stream_id"]);
        assert_eq!(value["protocol_version"], "1.0");
        assert!(value["sequence"].as_u64().unwrap() > sequence);
        sequence = value["sequence"].as_u64().unwrap();
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(15), other.recv())
            .await
            .is_err()
    );
    assert_eq!(hub.metrics().retained_bytes, 0);
}

#[tokio::test]
async fn admission_and_last_control_match_owner_session_and_client() {
    let hub = EventHub::new(EventLimits {
        maximum_subscriptions: 4,
        maximum_per_owner: 3,
        maximum_per_session: 2,
        ..EventLimits::default()
    })
    .unwrap();
    let mut a = hub.subscribe("owner", "session-a").unwrap();
    let mut b = hub.subscribe("owner", "session-a").unwrap();
    assert!(matches!(
        hub.subscribe("owner", "session-a"),
        Err(EventError::SubscriptionLimit)
    ));
    let mut c = hub.subscribe("owner", "session-b").unwrap();
    assert!(matches!(
        hub.subscribe("owner", "session-c"),
        Err(EventError::SubscriptionLimit)
    ));
    let mut d = hub.subscribe("other", "session-other").unwrap();
    assert!(matches!(
        hub.subscribe("fourth", "session-fourth"),
        Err(EventError::SubscriptionLimit)
    ));
    assert!(a.bind_control("tab") && b.bind_control("tab"));
    assert!(c.bind_control("tab") && d.bind_control("tab"));
    assert!(b.bind_control("tab"));
    assert!(!b.bind_control("different"));
    assert!(a.close().is_none());
    assert_eq!(
        b.close().unwrap(),
        ControlIdentity {
            owner: "owner".into(),
            session_id: "session-a".into(),
            client_id: "tab".into(),
        }
    );
    assert_eq!(c.close().unwrap().session_id, "session-b");
    assert_eq!(d.close().unwrap().owner, "other");
    assert_eq!(hub.metrics().subscriptions, 0);
}

#[tokio::test]
async fn ascii_wire_budget_and_inflight_accounting_fail_closed_on_revocation() {
    let hub = EventHub::new(EventLimits {
        maximum_subscriptions: 2,
        event_bytes: 1024,
        queue_bytes: 2048,
        total_bytes: 4096,
        ..EventLimits::default()
    })
    .unwrap();
    let mut sub = hub.subscribe("owner", "session").unwrap();
    hub.publish(
        "owner",
        json!({"type":"station.updated","station":{"station_id":"station","text":"é".repeat(140)}}),
    );
    let marker = sub.recv().await.unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(marker.text()).unwrap()["type"],
        "resync.required"
    );
    assert!(hub.metrics().retained_bytes > 0);
    drop(marker);
    assert_eq!(hub.metrics().retained_bytes, 0);

    hub.publish("owner", event(1));
    let delivered = sub.recv().await.unwrap();
    let reserved = hub.metrics().retained_bytes;
    assert!(reserved > 0);
    hub.publish("owner", event(2));
    hub.revoke_session("session");
    assert!(sub.revoked() && sub.recv().await.is_none());
    assert_eq!(hub.metrics().retained_bytes, reserved);
    drop(delivered);
    assert_eq!(hub.metrics().retained_bytes, 0);
    assert!(sub.close().is_none());
}

#[test]
fn inadequate_resync_reserve_is_rejected() {
    assert!(matches!(
        EventHub::new(EventLimits {
            maximum_subscriptions: 512,
            total_bytes: 512 * 512,
            ..EventLimits::default()
        }),
        Err(EventError::InvalidLimits)
    ));
}

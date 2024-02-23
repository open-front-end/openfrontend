# Command and Control of Clusters

Previous incarnations of this Frontend relied on the frontend webserver instance being able to SSH directly to clusters in order to performance command and control (C2) operations. When clusters were created, an admin user was set that would accept a public ssh key for which the webserver owned the private key. This was largely straightfoward, and worked quite well. The clusters were also able to make HTTP API queries to the webserver.

This works well in the case where webserver and clusters all have public IP addresses, and are able to receive inbound requests, but it breaks down in the case where a user may wish to have the compute clusters not be directly exposed to the public internet.

The new approach is based around [Google PubSub](https://cloud.google.com/pubsub/). The webserver and clusters now no longer directly communicate via SSH and HTTP, but rather send messages via Google Cloud. This offers the advantage of supporting clusters that are not publicly accessible, and removes the reliance on SSH connections between webserver and clusters.

## PubSub details

During deployment of a new Frontend system, a new Google PubSub Topic will be created.  This centralized topic is used for all command and control traffice between the Frontend webserver and the client clusters. Individual Subscriptions are created for each cluster controller, as well as for the Frontend itself.  The Frontend creates a new subscription for each cluster, and informs the cluster that it is to use the newly-created subscription.

![PubSub data flow](https://cloud.google.com/pubsub/images/wp_flow.svg)

### Message Delivery

Each [subscription is filtered](https://cloud.google.com/pubsub/docs/filtering) based off of a message attribute.  Messages to each Cluster **MUST** have an attribute `target=cluster_X` where `X` is the Cluster's unique ID. Messages to the Frontend **MUST NOT** have a `target` attribute.

By using filtering in this way, and having a 1:1 mapping between Subscription and Recipient, we guarantee that the messages being sent are received by only the intended recipient.

### Message Schema

Beyond the filtering attribute requirements previously discussed, the form of the messages are as follows:

#### Common Attributes

* `command` - The command being sent as part of the message
* `source` - The identity of the sender - corresponds to the `target` attribute. This is how the Frontend identifies which cluster sent the message

#### Common Message Data

* `ackid` - A UUID generated by the system to identify a command/response pair.

Each command will have additional data in the Message Data, specific to that command's requirements.

#### Commands

* `ACK` - Acknowledges a previous command, signals that the command is complete
* `UPDATE` - Acknowledges a previous command, but signals that the command is not yet complete.  Can be sent in response to other commands multiple times, to be finally followed by an `ACK`
* `PING`, `PONG` - Testing commands.  Not typically used
* `CLUSTER_STATUS` - Cluster command to Frontend to indicate a change in the status of the cluster. For example, to signal that the cluster has finished initialization and is ready for jobs.
* `SYNC` - Command to cluster to synchronize with the Frontend, including updating Log Files, and potentially other activities in the future (such as setting user permissions).
* `SPACK_INSTALL` - Install a Spack package
* `RUN_JOB` - Submit a job on behalf of a user to SLURM
* `REGISTER_USER_GCS` - Begin the process to register a user's GCS credentials with `gsutil`.

### Cluster C2 Daemon

During startup of a cluster, a Daemon is installed which creates a Streaming Pull thread to Subscribe to the Cluster's Subscription.  This daemon is responsible for responding to C2 messages and following through on the message's requests, including submitting jobs to SLURM to install Spack packages, and run user's jobs.

### Security

The C2 topic is created at deployment time, as well as the subscription for the Frontend.  Topic creation permission is then no longer required by the Service Accounts of the Frontend or the Clusters.

When a Cluster is created, a new Service Account is created for that Cluster.  This Service Account is then granted `pubsub.subscriber` permissions to the C2 Topic, and `pubsub.publisher` permissions to that cluster's own Subscription.  The Service Accounts for the clusters are created without any Google PubSub IAM permissions, so these policy bindings on the topic and subscription are the only PubSub IAM permissions granted to the cluster's service accounts.

Sadly, the Frontend's Service Account must have either the role of `pubsub.admin` or a custom role, set at the project level.  This is because creating subscriptions and setting IAM Policy Bindings are actions done at the project level, rather than attached to the topic.

By setting IAM policy bindings, we are able to grant permissions to service accounts which are associated with clusters which are in projects other than the base project where the Frontend resides.

For example, if the Frontend is in GCP Project `Alpha`, the C2 Topic will also be in Project `Alpha`.  If a cluster is then created in project `Beta`, the Frontend will grant the cluster's Service Account IAM permissions within the `Alpha` project.

## Data Storage

Clusters automatically upload job logs to a GCS bucket, which is specified at cluster creation time.  The Cluster's Service Account is granted ObjectAdmin permissions in order to create and update Log files in the GCS bucket.

The Frontend webserver displays log files from the GCS bucket.
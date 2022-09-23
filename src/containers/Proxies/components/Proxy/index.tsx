import type { AxiosError } from "axios";
import classnames from "classnames";
import { ResultAsync } from "neverthrow";
import { useMemo, useLayoutEffect, useCallback } from "react";

import EE, { Action } from "@lib/event";
import { isClashX, jsBridge } from "@lib/jsBridge";
import { Proxy as IProxy } from "@lib/request";
import { BaseComponentProps } from "@models";
import { useClient, useConfig, useProxy } from "@stores";

import "./style.scss";

interface ProxyProps extends BaseComponentProps {
    config: IProxy;
}

const TagColors = {
    "#909399": 0,
    "#00c520": 260,
    "#ff9a28": 600,
    "#ff3e5e": Infinity,
};

export function Proxy(props: ProxyProps) {
    const { config, className } = props;
    const { set, markProxySelected, groups } = useProxy();
    const client = useClient();
    const { data: appConfig } = useConfig();

    async function handleChangeProxySelected() {
        await client.changeProxySelected(groups[0].name, props.config.name);
        markProxySelected(groups[0].name, props.config.name);
        if (appConfig.breakConnections) {
            const list: string[] = [];
            const snapshot = await client.getConnections();
            for (const connection of snapshot.data.connections) {
                if (connection.chains.includes(props.config.name)) {
                    list.push(connection.id);
                }
            }

            await Promise.all(list.map((id) => client.closeConnection(id)));
        }
    }

    const getDelay = useCallback(
        async (name: string) => {
            if (isClashX()) {
                const delay = (await jsBridge?.getProxyDelay(name)) ?? 0;
                return delay;
            }

            const {
                data: { delay },
            } = await client.getProxyDelay(name);
            return delay;
        },
        [client]
    );

    const speedTest = useCallback(
        async function () {
            const result = await ResultAsync.fromPromise(
                getDelay(config.name),
                (e) => e as AxiosError
            );

            const validDelay = result.isErr() ? 0 : result.value;
            set((draft) => {
                const proxy = draft.proxies.find((p) => p.name === config.name);
                if (proxy != null) {
                    proxy.history.push({
                        time: Date.now().toString(),
                        delay: validDelay,
                    });
                }
            });
        },
        [config.name, getDelay, set]
    );

    const delay = useMemo(
        () => (config.history?.length ? config.history.slice(-1)[0].delay : 0),
        [config]
    );

    useLayoutEffect(() => {
        const handler = () => {
            speedTest();
        };
        EE.subscribe(Action.SPEED_NOTIFY, handler);
        return () => EE.unsubscribe(Action.SPEED_NOTIFY, handler);
    }, [speedTest]);

    const hasError = useMemo(() => delay === 0, [delay]);
    const isCurrent = useMemo(
        () => groups[0].now === config.name,
        [groups[0].now]
    );
    const color = useMemo(
        () =>
            Object.keys(TagColors).find(
                (threshold) =>
                    delay <= TagColors[threshold as keyof typeof TagColors]
            ),
        [delay]
    );

    const backgroundColor = hasError ? "#E5E7EB" : color;
    return (
        <div
            className={classnames(
                "proxy-item",
                { "opacity-50": hasError, "selected-proxy": isCurrent },
                className
            )}
            onClick={() => {
                !hasError && handleChangeProxySelected();
            }}
        >
            <div className="flex-1">
                <span
                    className={classnames(
                        "rounded-sm py-[3px] px-1 text-[10px] text-white",
                        {
                            "text-gray-600": hasError,
                        }
                    )}
                    style={{ backgroundColor }}
                >
                    {config.type}
                </span>
                <p className="proxy-name">{config.name}</p>
            </div>
            <div className="flex h-full flex-col items-center justify-center space-y-3 text-[10px] md:h-[18px] md:flex-row md:justify-between md:space-y-0">
                <p className="proxy-delay">
                    {delay === 0 ? "-" : `${delay}ms`}
                </p>
                {config.udp && (
                    <p className="rounded bg-gray-200 p-[3px] proxy-udp">UDP</p>
                )}
            </div>
        </div>
    );
}

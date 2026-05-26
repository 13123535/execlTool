/**
 * ConfirmDialog — 操作确认弹窗
 *
 * 监听 confirmStore.pendingRequest 状态。
 * 当有新的确认请求时，弹出 antd Modal 提示用户确认。
 *
 * 确认 → 调用 resolve(true) → 清除请求 → Worker 继续执行
 * 取消 → 调用 resolve(false) → 清除请求 → Worker 取消执行
 */

import React from "react";
import { Modal, Typography } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useConfirmStore } from "../stores/confirmStore";

const { Text, Title } = Typography;

export const ConfirmDialog: React.FC = () => {
  const pendingRequest = useConfirmStore((s) => s.pendingRequest);
  const _clear = useConfirmStore((s) => s._clear);

  const handleOk = () => {
    if (pendingRequest) {
      pendingRequest.resolve(true);
      _clear();
    }
  };

  const handleCancel = () => {
    if (pendingRequest) {
      pendingRequest.resolve(false);
      _clear();
    }
  };

  return (
    <Modal
      title={
        <span>
          <ExclamationCircleOutlined
            style={{ color: "#faad14", marginRight: 8 }}
          />
          确认执行操作
        </span>
      }
      open={pendingRequest !== null}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="确认执行"
      cancelText="取消"
      destroyOnClose
      centered
    >
      {pendingRequest && (
        <div>
          <Title level={5} style={{ marginBottom: 8 }}>
            {pendingRequest.operationType}
          </Title>
          <Text type="secondary">{pendingRequest.message}</Text>
        </div>
      )}
    </Modal>
  );
};
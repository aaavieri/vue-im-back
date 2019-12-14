CREATE TABLE `t_user` (
  `server_user_id` int(11) NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `server_user_account` varchar(10) NOT NULL COMMENT '用户登录用账号',
  `channel_id` int(11) NOT NULL COMMENT '渠道ID',
  `server_user_name` varchar(20) NOT NULL COMMENT '用户名称',
  `server_user_pass` varchar(50) NOT NULL COMMENT '用户密码',
  `settings` text COMMENT '用户设置',
  `del_flag` tinyint(4) NOT NULL DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `create_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '创建者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `update_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '更新者',
  `row_version` int(11) NOT NULL DEFAULT '1' COMMENT '版本',
  PRIMARY KEY (`server_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `t_user_token` (
  `server_user_id` int(11) NOT NULL COMMENT '用户ID',
  `token` varchar(255) NULL COMMENT 'token',
  `login_time` datetime NULL COMMENT '登录时间',
  `expire_time` datetime NULL COMMENT '过期时间',
  `del_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `create_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '创建者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `update_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '更新者',
  `row_version` int(11) NOT NULL DEFAULT '1' COMMENT '版本',
  PRIMARY KEY (`server_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `t_chat_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT COMMENT '流水ID',
  `session_id` int(11) NOT NULL COMMENT '会话ID',
  `message` varchar(100) NULL COMMENT '消息内容',
  `message_type` tinyint(1) NOT NULL DEFAULT '1' COMMENT '消息类型：1：文本，2：图片，3：语音',
  `type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0：客户到客服，1：客服到客户',
  `del_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `create_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '创建者',
  `row_version` int(11) NOT NULL DEFAULT '1' COMMENT '版本',
  PRIMARY KEY (`history_id`),
  KEY `sessionIdx` (`session_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `t_chat_session` (
  `session_id` int(11) NOT NULL AUTO_INCREMENT COMMENT '会话ID',
  `server_user_id` int(11) NOT NULL COMMENT '用户ID',
  `open_id` varchar(50) NOT NULL COMMENT '客户的OPENID',
  `start_time` datetime NOT NULL COMMENT '开始时间',
  `end_time` datetime NULL COMMENT '结束时间',
  `rank` tinyint(1) NULL COMMENT '客服评分',
  `del_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `create_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '创建者',
  `row_version` int(11) NOT NULL DEFAULT '1' COMMENT '版本',
  PRIMARY KEY (`session_id`),
  KEY `userIdx` (`server_user_id`) USING BTREE,
  KEY `clientIdx` (`open_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `t_client_info` (
  `channel_id` int(11) NOT NULL COMMENT '渠道ID',
  `open_id` varchar(50) NOT NULL COMMENT '客户的OPENID',
  `user_name` varchar(50) NOT NULL COMMENT '客户昵称' default '',
  `avatar` varchar(50) NULL COMMENT '头像地址',
  `phone_num` varchar(11) NULL COMMENT '客户手机号',
  `user_status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '用户状态',
  `del_flag` tinyint(4) NOT NULL DEFAULT '0' COMMENT '删除标志',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `create_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '创建者',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  `update_user` varchar(10) NOT NULL DEFAULT 'system' COMMENT '更新者',
  `row_version` int(11) NOT NULL DEFAULT '1' COMMENT '版本',
  PRIMARY KEY (`channel_id`, `open_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
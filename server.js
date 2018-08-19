var http=require("http");
var express=require("express");
//ejs를 굳이 require 하지 않더라도 사용 가능함...
//fs도 require 하지말자..  (주의 ejs 모듈을 다운받아야함)
//왜???  response.render() 메서드 이용하면 굳이 
//  ejs.render()
var bodyParser=require("body-parser");
var mysql=require("mysql");
var app=express();
var server=http.createServer(app);//기본서버에서 --> 업그레이드서버

//정적자원(html, images, css, 동영상 등 주로 보여주기 위한 용도의 결과물
//) 들의 위치를 서버에 등록해놓자!! 이렇게 하면 일일이 정적자원에 대해
//요청처리 라우팅 처리가 필요없다...

//view란? 눈에 보여지는 것을 의미하고, 전산에서는 디자인영역을 의미함..
//즉 사용자들에 사용하게 될 ui 를 의미..
app.use(express.static(__dirname+"/views"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
// 뷰 템플릿 엔진 등록 ( ejs 확장자를 뷰로 사용하겠다) 
app.set("view engine", "ejs");//ejs 확장자를 뷰로 사용하겠다!!


//사용자가 많은 대형 웹어플리케이션에서는 사용자의 요청이 있을때마다 
//데이터베이스의 연결을 하지 않는다...즉 사용자가 없더라도 메모리에 미리 
//접속 객체를 확보해 모아놓는다. 이러한 데이터베이스 처리 기법을 커넥션풀링
//이라 한다..

//풀 생성!! 
var pool=mysql.createPool({
	host:"localhost",
	user:"root",
	password:"",
	database:"front"
});


//board 글등록 요청 처리 
app.post("/board/regist", function(request ,reponse){
	//파라미터로 전송된 값을 알아본다
	console.log(request.body);//{title:"", }
	var sql="insert into board(title,writer,content) values(?,?,?)";
	
	pool.getConnection(function(error,con){
		con.query(sql, [request.body.title , request.body.writer, request.body.content], function(err, result){
			if(err){
				console.log(err);
			}else{
				console.log(result);
				//클라이언트 브라우저로 하여금 지정한  url로 다시 들어오도록 명령
				response.redirect("/board/list");
			}
			con.release(); //pool에 다시 반납
		});
	});//대여..
	
});

//board 목록 보기 처리 
app.get("/board/list", function(request, response){
	//부모: board 무조건 노출,  자식:코멘트..
	var sql="select b.board_id, title, writer, date_format(regdate,'%Y-%m-%d') as regdate, count(msg) as cnt";
	sql+=" from board b left outer join comments c";
	sql+=" on b.board_id=c.board_id"; //n*n 의 방지
	sql+=" group by b.board_id,title,writer,regdate";
	
	pool.getConnection(function(error, con){
		if(error){
			console.log(error);
		}else{
			con.query(sql, function(err, result , fields){
				if(err){
					console.log(err);
				}else{
					console.log(result);
					//list.ejs 보여주기!!
					response.render("board/list", {
						rows:result // [ {},{},{}]
					});
				}
			});
		}
		con.release(); //pool에 반납!!
	});

});

//게시판 상세보기 요청 처리 
app.get("/board/content", function(request, response){
	console.log(request.query);
	var board_id=request.query.board_id;//넘어온 board_id값
	var sql="select * from board where board_id=?";

	pool.getConnection(function(error, con){//풀로부터 대여!!
		if(error){
			console.log(error);
		}else{
			con.query(sql, [board_id], function(err, result , fields){
				console.log(result);	
				//현재 상세보기 글에 등록된 코멘트 목록 가져오기!!!
				sql="select * from comments where board_id=? order by comments_id asc";
				con.query(sql, [board_id], function(e, r, f){
					response.render("board/content", {
						row:result[0],
						rows:r
					});
				});

			});
		}	
		con.release();
	});

});

//코멘트 글 등록 요청 처리 
app.post("/comments/regist", function(request, response){
	console.log(request.body);

	var msg=request.body.msg;
	var cwriter=request.body.cwriter;
	var board_id=request.body.board_id;

	var sql="insert into comments(cwriter,msg,board_id) values(?,?,?)";
	
	pool.getConnection(function(error, con){
		if(error){
			console.log(error);
		}else{
			con.query(sql, [cwriter,msg, board_id], function(err, result){
				if(err){
					console.log(err);
				}else{
					console.log(result);
					if(result.affectedRows==1){
						//입력성공, 댓글의 메세지와 작성자 다시 보내기!!
						response.writeHead(200,{"Content-Type":"text/json"});
						response.end("{\"msg\": \""+msg+"\",\"cwriter\": \""+cwriter+"\"}");
					}else{
						//입력실패
					}
				}
			});
		}
	});
});

//board 삭제 요청 처리 
app.get("/board/delete", function(request, response){
	var board_id=request.query.board_id;

	pool.getConnection(function(error, con){
		con.beginTransaction(function(err){
			console.log("트랜잭션 시작...");
			//부모 테이블인 board 삭제 
			var sql="delete from board where board_id=?";
			con.query(sql,[board_id], function(e1, result){
				if(e1){
					console.log(e1);
				}else{
					//부모가 에러가 안났으므로, 자식 삭제를 시도한다!!
					sql="delete from comments where board_id=?";
					con.query(sql,[board_id], function(e2, result2){
						if(e2){
							console.log(e2);
							con.rollback(function(err){
								console.log("자식 테이블 삭제 롤백됨 1");
							});//지금까지의 모든 DML을 되돌려놓는다
						}else{
							//에러가 아닌 정상 쿼리수행..영역 
							console.log(result2);
							//mysql 에서는 affectedRows 를 사용하여 판단..
							//orale 과는 틀림
							con.commit(function(err){
								console.log("모든 트랜잭션 확정됨 commit!!");
								response.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});
								response.end("<script>alert('삭제완료');location.href='/board/list';</script>");
							});
							
							/* 자식글이 전혀 없을때 부모글을 롤백시키면 안됨...
							if(result2.affectedRows==0){
								con.rollback(function(err){
									console.log("자식 테이블 삭제 롤백 2");
								});
							}else{
							}
							*/
						}
					});
				}
								
			});
			con.release();
		});
	});
});

//board 수정 요청 처리 
app.post("/board/edit", function(request, response){
	console.log(request.body);
	var title=request.body.title;
	var writer=request.body.writer;
	var content=request.body.content;
	var board_id=request.body.board_id;

	var sql="update board set titie=?, writer=?, content=? where board_id=?";
	
	pool.getConnection(function(error, con){
		if(error){
			console.log(err);
		}else{
			con.query(sql,[title,writer,content,board_id], function(err, result){
				if(err){
					console.log(err);
				}else{
					var msg;
					if(result.affectedRows==1){
						msg="<script>alert('수정완료');location.href='/board/content?board_id="+board_id+"';</script>";
					}else{
						msg="<script>alert('수정실패');history.back();</script>";
					}
					response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
					response.end(msg);
				}
			});
			con.release();
		}
	});


});

server.listen(8888, function(){
	console.log("웹서버가 8888포트에서 가동중...");
});







